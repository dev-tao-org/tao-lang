import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Timings, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { loadModules } from '../../workspace-src/modules/Loader'

Tests.test('loads direct directory imports from a virtual entry and records discovery timings', async () => {
  const root = await createProject()
  await Try(async () => {
    const directory = Path.join(root, 'views')
    const emptyDirectory = Path.join(root, 'empty')
    await FileSystem.mkdir(directory, { recursive: true })
    await FileSystem.mkdir(emptyDirectory, { recursive: true })
    const target = Path.join(directory, 'Card.tao')
    await FileSystem.writeFile(target, view('Card'))
    const timings = new Timings('module-loader-test')
    const sources = await loadModules(
      parseEntry(Path.join(root, 'Main.virtual.tao'), `use all from ./views\nuse all from ./empty\n${app('Main')}`),
      { directory: root },
      createParser(),
      timings,
    )

    Tests.expect(sources.map(source => source.path)).toEqual([Path.join(root, 'Main.virtual.tao'), target])
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: target, relation: 'same-directory' }])
    Tests.expect(sources[0]!.imports[1]!.targets).toEqual([])
    Tests.expect(timings.samples.map(sample => sample.name)).toContain('modules.load')
    Tests.expect(timings.samples.map(sample => sample.name)).toContain('modules.discover')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('loads a project through a symlink using canonical source roots', async () => {
  const root = await createProject()
  const alias = `${root}-alias`
  await Try(async () => {
    const entry = Path.join(root, 'Main.tao')
    const sibling = Path.join(root, 'Nearby.tao')
    await FileSystem.writeFile(entry, app('Main'))
    await FileSystem.writeFile(sibling, view('Nearby'))
    await FileSystem.symlink(root, alias)
    const aliasEntry = Path.join(alias, 'Main.tao')
    const sources = await loadModules(
      parseEntry(aliasEntry, `use Nearby\n${app('Main')}`),
      { directory: alias },
      createParser(),
      new Timings('module-loader-test'),
    )

    Tests.expect(sources.map(source => source.path)).toEqual([entry, sibling])
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: sibling, relation: 'same-directory' }])
  }, {
    async finally() {
      await FileSystem.rm(root, { recursive: true, force: true })
      await FileSystem.rm(alias, { force: true })
    },
  })
})

Tests.test('resolves a named package recursively and reports its import ownership', async () => {
  const root = await createProject()
  await Try(async () => {
    const packageRoot = Path.join(root, '@parts')
    const card = Path.join(packageRoot, 'nested', 'Card.tao')
    const nestedProjectCard = Path.join(root, 'child', '.tao', '@parts', 'Nested.tao')
    await FileSystem.mkdir(Path.dirname(card), { recursive: true })
    await FileSystem.mkdir(Path.dirname(nestedProjectCard), { recursive: true })
    await FileSystem.writeFile(card, view('Card'))
    await FileSystem.writeFile(nestedProjectCard, view('Nested'))
    const sources = await loadModules(
      parseEntry(Path.join(root, 'Main.tao'), `use all from @parts\n${app('Main')}`),
      { directory: root },
      createParser(),
      new Timings('module-loader-test'),
    )

    Tests.expect(sources.map(source => source.path)).toContain(card)
    Tests.expect(sources.map(source => source.path)).not.toContain(nestedProjectCard)
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: card, relation: 'same-project' }])
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('loads standard library modules from an ordinary aliased Tao project', async () => {
  const root = await createProject()
  await Try(async () => {
    const standardRoot = Path.join(root, 'standard')
    const standardPath = Path.join(standardRoot, '@ui', 'Views.tao')
    await FileSystem.mkdir(Path.join(standardRoot, '.tao'), { recursive: true })
    await FileSystem.mkdir(Path.dirname(standardPath), { recursive: true })
    await FileSystem.writeFile(standardPath, view('Actual'))
    const sources = await loadModules(
      parseEntry(Path.join(root, 'Main.tao'), `use all from tao@ui\n${app('Main')}`),
      {
        directory: root,
        resolveProject: async (_importer, alias) => alias === 'tao' ? { root: standardRoot } : undefined,
      },
      createParser(),
      new Timings('module-loader-test'),
    )

    Tests.expect(sources.map(source => source.path)).toContain(standardPath)
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: standardPath, relation: 'public' }])
    Tests.expect(sources[1]!.document.root.declarations[0]!.kind).toBe('ViewDeclaration')
    Tests.expect((sources[1]!.document.root.declarations[0] as AST.ViewDeclaration).name.value).toBe('Actual')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('a local @tao folder follows ordinary named-module boundaries', async () => {
  const root = await createProject()
  await Try(async () => {
    await writeSources(Path.join(root, '@tao', 'Card.tao'), view('Card'))
    await Tests.rejects(
      loadModules(
        parseEntry(Path.join(root, 'Main.tao'), `use all from ./@tao\n${app('Main')}`),
        { directory: root },
        createParser(),
        new Timings('module-loader-test'),
      ),
      /crosses a named package boundary/,
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('rejects symlinked source files that resolve outside the owning project', async () => {
  const root = await createProject()
  await Try(async () => {
    const outside = Path.join(root, 'Outside.tao')
    const link = Path.join(root, 'project', 'Linked.tao')
    await FileSystem.mkdir(Path.dirname(link), { recursive: true })
    await FileSystem.writeFile(outside, view('Outside'))
    await FileSystem.symlink(outside, link)
    const projectRoot = Path.join(root, 'project')
    await FileSystem.mkdir(Path.join(projectRoot, '.tao'), { recursive: true })
    await Tests.rejects(
      loadModules(
        parseEntry(Path.join(projectRoot, 'Main.tao'), `use all from ./Linked.tao\n${app('Main')}`),
        { directory: projectRoot },
        createParser(),
        new Timings('module-loader-test'),
      ),
      /leaves the owning Tao project/,
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('loads the real module journey without adopting an unrelated workspace directory', async () => {
  const unrelatedWorkspace = await createProject()
  const entryPath = Repo.resolvePath('Apps/Tests/Modules/Modules.tao')
  const standardRoot = Path.join(unrelatedWorkspace, 'standard-library')
  const standardView = Path.join(standardRoot, '@ui', 'Views.tao')
  await Try(async () => {
    await FileSystem.mkdir(Path.join(standardRoot, '.tao'), { recursive: true })
    await writeSources(standardView, 'public view Text { render Text("Text") }\npublic view Col { render Col {} }')
    const source = await FileSystem.readFile(entryPath, 'utf8')
    const modules = await loadModules(
      parseEntry(entryPath, source),
      {
        directory: unrelatedWorkspace,
        resolveProject: async (_importer, alias) => alias === 'tao' ? { root: standardRoot } : undefined,
      },
      createParser(),
      new Timings('module-loader-test'),
    )

    Tests.expect(modules.map(module => Path.relative(Path.dirname(entryPath), module.path)).sort()).toEqual([
      'Modules.tao',
      'Nearby.tao',
      'Public/Caption.tao',
      '@cards/Card.tao',
      '@cards/Data/Caption.tao',
      Path.relative(Path.dirname(entryPath), standardView),
    ].sort())
  }, { finally: () => FileSystem.rm(unrelatedWorkspace, { recursive: true, force: true }) })
})

async function createProject(): Promise<string> {
  const root = Artifacts.resolvePath('tmp', `module-loader-${Platform.randomUUID()}`)
  await FileSystem.mkdir(Path.join(root, '.tao'), { recursive: true })
  return root
}

async function writeSources(path: string, source: string): Promise<void> {
  await FileSystem.mkdir(Path.dirname(path), { recursive: true })
  await FileSystem.writeFile(path, source)
}

function parseEntry(path: string, source: string): { path: string; document: AST.Document } {
  const document = transform(createParser().parse(source).tree)
  Tests.expect(document).toBeDefined()
  return { path, document: document! }
}

function app(name: string): string {
  return `app ${name} { root Root }`
}

function view(name: string): string {
  return `view ${name} { render Text("${name}") }`
}
