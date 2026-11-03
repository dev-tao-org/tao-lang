import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'
import * as Typecheck from '@typecheck'

import { NewlineCharacter, S, Timings, Try } from '@shared'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'

import { loadModules } from '../../workspace-src/modules/Loader'

const NamedPackageBoundaryErrorRegx = /crosses a named package boundary/
const OwningTaoProjectBoundaryErrorRegx = /leaves the owning Tao project/

Tests.test('relative imports cannot expose folder declarations from a different directory', async () => {
  const root = await createProject()
  await Try(async () => {
    await writeSources(Path.join(root, 'Child', 'Secrets.tao'), 'folder let Secret = "private"')
    const entry = parseEntry(Path.join(root, 'Main.tao'), 'use ./Child Secret')
    const modules = await loadModules(entry, { directory: root }, Grammar.createParser())
    Tests.expect(() => Typecheck.linkModules(entry.path, modules)).toThrow('it is not visible')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test(
  'loads direct directory imports from a virtual entry and records discovery timings',
  Timings.createTopLevelTimer(async timings => {
    const root = await createProject()
    await Try(async () => {
      const directory = Path.join(root, 'views')
      const emptyDirectory = Path.join(root, 'empty')
      await FS.mkdirs(directory, emptyDirectory)
      const target = Path.join(directory, 'Card.tao')
      await FS.writeFile(target, view('Card'))

      const sources = await timings.run(
        loadModules,
        parseEntry(
          Path.join(root, 'Main.virtual.tao'),
          S`
            use ./views all
            use ./empty all
            ${app('Main')}
          `,
        ),
        { directory: root },
        Grammar.createParser(),
      )

      Tests.expect(sources.map(source => source.path)).toEqual([Path.join(root, 'Main.virtual.tao'), target])
      Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: target, relation: 'same-project' }])
      Tests.expect(sources[0]!.imports[1]!.targets).toEqual([])
      Tests.expect(timings.samples.map(sample => sample.name)).toContain('modules.load')
      Tests.expect(timings.samples.map(sample => sample.name)).toContain('modules.discover')
    }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
  }),
)

Tests.test('loads a project through a symlink using canonical source roots', async () => {
  const root = await createProject()
  const alias = `${root}-alias`
  await Try(async () => {
    const entry = Path.join(root, 'Main.tao')
    const sibling = Path.join(root, 'Nearby.tao')
    await FS.writeFile(entry, app('Main'))
    await FS.writeFile(sibling, view('Nearby'))
    await FS.symlink(root, alias)
    const aliasEntry = Path.join(alias, 'Main.tao')
    const sources = await loadModules(
      parseEntry(aliasEntry, `use Nearby${NewlineCharacter}${app('Main')}`),
      { directory: alias },
      Grammar.createParser(),
    )

    Tests.expect(sources.map(source => source.path)).toEqual([entry, sibling])
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: sibling, relation: 'same-directory' }])
  }, {
    async finally() {
      await FS.rm(root, { recursive: true, force: true })
      await FS.rm(alias, { force: true })
    },
  })
})

Tests.test('resolves a named package recursively and reports its import ownership', async () => {
  const root = await createProject()
  await Try(async () => {
    const packageRoot = Path.join(root, '@parts')
    const card = Path.join(packageRoot, 'nested', 'Card.tao')
    const nestedProjectCard = Path.join(root, 'child', '.tao', '@parts', 'Nested.tao')
    await FS.mkdirs(Path.dirname(card), Path.dirname(nestedProjectCard))
    await FS.writeFile(card, view('Card'))
    await FS.writeFile(nestedProjectCard, view('Nested'))
    const sources = await loadModules(
      parseEntry(Path.join(root, 'Main.tao'), `use @parts all${NewlineCharacter}${app('Main')}`),
      { directory: root },
      Grammar.createParser(),
    )

    Tests.expect(sources.map(source => source.path)).toContain(card)
    Tests.expect(sources.map(source => source.path)).not.toContain(nestedProjectCard)
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: card, relation: 'same-project' }])
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('a markerless aliased source root retains its configured directory boundary', async () => {
  const root = await createProject()
  const alias = root + '-alias'
  await Try(async () => {
    await FS.rm(Path.join(root, '.tao'), { recursive: true, force: true })
    await writeSources(Path.join(root, 'Outside.tao'), view('Outside'))
    const source = `use ../Outside Outside${NewlineCharacter}${app('Main')}`
    await writeSources(Path.join(root, 'nested/Main.tao'), source)
    await FS.symlink(root, alias, 'dir')
    const sources = await loadModules(
      parseEntry(Path.join(alias, 'nested/Main.tao'), source),
      { directory: alias },
      Grammar.createParser(),
    )
    Tests.expect(sources.map(module => module.path)).toEqual([
      Path.join(root, 'nested/Main.tao'),
      Path.join(root, 'Outside.tao'),
    ])
  }, {
    async finally() {
      await FS.rm(alias, { force: true })
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('loads standard library modules from an ordinary aliased Tao project', async () => {
  const root = await createProject()
  await Try(async () => {
    const standardRoot = Path.join(root, 'standard')
    const standardPath = Path.join(standardRoot, '@ui', 'Views.tao')
    await FS.mkdirs(Path.join(standardRoot, '.tao'), Path.dirname(standardPath))
    await FS.writeFile(standardPath, view('Actual'))
    const sources = await loadModules(
      parseEntry(Path.join(root, 'Main.tao'), `use tao@ui all${NewlineCharacter}${app('Main')}`),
      {
        directory: root,
        resolveProject: async (_importer, alias) => alias === 'tao' ? { root: standardRoot } : undefined,
      },
      Grammar.createParser(),
    )

    Tests.expect(sources.map(source => source.path)).toContain(standardPath)
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: standardPath, relation: 'public' }])
    Tests.expect(AST.GetDeclarations(sources[1]!.document)[0]!.kind).toBe('ViewDeclaration')
    Tests.expect((AST.GetDeclarations(sources[1]!.document)[0] as AST.ViewDeclaration).name.value).toBe('Actual')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('an absent virtual entry under a markerless alias retains its configured source boundary', async () => {
  const root = await createProject()
  const alias = root + '-alias'
  await Try(async () => {
    await FS.rm(Path.join(root, '.tao'), { recursive: true, force: true })
    await writeSources(Path.join(root, 'Outside.tao'), view('Outside'))
    await FS.mkdir(Path.join(root, 'nested'))
    await FS.symlink(root, alias, 'dir')
    const entry = Path.join(alias, 'nested/New.tao')
    const source = `use ../Outside Outside${NewlineCharacter}${app('Main')}`
    const sources = await loadModules(parseEntry(entry, source), { directory: alias }, Grammar.createParser())
    Tests.expect(sources.map(module => module.path)).toEqual([
      Path.join(root, 'nested/New.tao'),
      Path.join(root, 'Outside.tao'),
    ])
    Tests.expect(await FS.exists(entry)).toBe(false)
  }, {
    async finally() {
      await FS.rm(alias, { force: true })
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('a local @tao folder follows ordinary named-module boundaries', async () => {
  const root = await createProject()
  await Try(async () => {
    await writeSources(Path.join(root, '@tao', 'Card.tao'), view('Card'))
    await Tests.rejects(
      loadModules(
        parseEntry(Path.join(root, 'Main.tao'), `use ./@tao all${NewlineCharacter}${app('Main')}`),
        { directory: root },
        Grammar.createParser(),
      ),
      NamedPackageBoundaryErrorRegx,
    )
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('relative imports cannot leave a named module for the unnamed project module', async () => {
  const root = await createProject()
  await Try(async () => {
    await writeSources(Path.join(root, 'Outside.tao'), view('Outside'))
    const entry = Path.join(root, '@cards', 'Card.tao')
    const source = `use ../Outside Outside${NewlineCharacter}${view('Card')}`
    await writeSources(entry, source)
    await Tests.rejects(
      loadModules(parseEntry(entry, source), { directory: root }, Grammar.createParser()),
      NamedPackageBoundaryErrorRegx,
    )
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('rejects symlinked source files that resolve outside the owning project', async () => {
  const root = await createProject()
  await Try(async () => {
    const outside = Path.join(root, 'Outside.tao')
    const link = Path.join(root, 'project', 'Linked.tao')
    await FS.mkdir(Path.dirname(link))
    await FS.writeFile(outside, view('Outside'))
    await FS.symlink(outside, link)
    const projectRoot = Path.join(root, 'project')
    await FS.mkdir(Path.join(projectRoot, '.tao'))
    await Tests.rejects(
      loadModules(
        parseEntry(Path.join(projectRoot, 'Main.tao'), `use ./Linked.tao all${NewlineCharacter}${app('Main')}`),
        { directory: projectRoot },
        Grammar.createParser(),
      ),
      OwningTaoProjectBoundaryErrorRegx,
    )
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('loads the real module journey without adopting an unrelated workspace directory', async () => {
  const unrelatedWorkspace = await createProject()
  const entryPath = Repo.resolvePath('Apps/Tests/Modules and Dependencies/Modules and Dependencies.tao')
  const standardRoot = Path.join(unrelatedWorkspace, 'standard-library')
  const standardView = Path.join(standardRoot, '@ui', 'Views.tao')
  await Try(async () => {
    await FS.mkdir(Path.join(standardRoot, '.tao'))
    await writeSources(
      standardView,
      S`
        public view Text { render Text("Text") }
        public view Col { render Col {} }
      `,
    )
    const source = await FS.readFile(entryPath, 'utf8')
    const modules = await loadModules(
      parseEntry(entryPath, source),
      {
        directory: unrelatedWorkspace,
        resolveProject: async (_importer, alias) => alias === 'tao' ? { root: standardRoot } : undefined,
      },
      Grammar.createParser(),
    )

    Tests.expect(modules.map(module => Path.relative(Path.dirname(entryPath), module.path)).sort()).toEqual([
      'Imports.tao',
      'Imports.test.tao',
      'Modules and Dependencies.tao',
      'Nearby.tao',
      'Public/Caption.tao',
      '@cards/Captions.tao',
      '@cards/Card.tao',
      '@cards/Data/Caption.tao',
      Path.relative(Path.dirname(entryPath), standardView),
    ].sort())
  }, { finally: () => FS.rm(unrelatedWorkspace, { recursive: true, force: true }) })
})

async function createProject(): Promise<string> {
  const root = Artifacts.resolvePath('tmp', `module-loader-${Platform.randomUUID()}`)
  await FS.mkdir(Path.join(root, '.tao'))
  return root
}

async function writeSources(path: string, source: string): Promise<void> {
  await FS.mkdir(Path.dirname(path))
  await FS.writeFile(path, source)
}

function parseEntry(path: string, source: string): { path: string; document: AST.Document } {
  const document = AST.transform(Grammar.createParser().parse(source))
  Tests.expect(document).toBeDefined()
  return { path, document: document! }
}

function app(name: string): string {
  return `app ${name} { root Root }`
}

function view(name: string): string {
  return `view ${name} { render Text("${name}") }`
}
