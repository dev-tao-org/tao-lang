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
      { directory: root, stdlibSources: new Map() },
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
      { directory: root, stdlibSources: new Map() },
      createParser(),
      new Timings('module-loader-test'),
    )

    Tests.expect(sources.map(source => source.path)).toContain(card)
    Tests.expect(sources.map(source => source.path)).not.toContain(nestedProjectCard)
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: card, relation: 'same-project' }])
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('keeps stdlib directory sources public and reads physical text on every load', async () => {
  const root = await createProject()
  await Try(async () => {
    const standardRoot = Path.join(root, 'standard')
    const standardPath = Path.join(standardRoot, '@tao', 'ui', 'Views.tao')
    await FileSystem.mkdir(Path.dirname(standardPath), { recursive: true })
    await FileSystem.writeFile(standardPath, view('Actual'))
    const virtualPath = Path.join(root, 'virtual-stdlib', '@tao', 'ui', 'Views.tao')
    const sources = await loadModules(
      parseEntry(Path.join(root, 'Main.tao'), `use all from @tao/ui\n${app('Main')}`),
      {
        directory: root,
        stdlibDirectory: standardRoot,
        stdlibSources: new Map([[virtualPath, view('Outdated')]]),
      },
      createParser(),
      new Timings('module-loader-test'),
    )

    Tests.expect(sources.map(source => source.path)).toContain(virtualPath)
    Tests.expect(sources[0]!.imports[0]!.targets).toEqual([{ path: virtualPath, relation: 'public' }])
    Tests.expect(sources[1]!.document.root.declarations[0]!.kind).toBe('ViewDeclaration')
    Tests.expect((sources[1]!.document.root.declarations[0] as AST.ViewDeclaration).name.value).toBe('Actual')
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
        { directory: projectRoot, stdlibSources: new Map() },
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
  const virtualStdlib = Path.join(unrelatedWorkspace, 'virtual-stdlib/@tao/ui/Views.tao')
  await Try(async () => {
    const source = await FileSystem.readFile(entryPath, 'utf8')
    const modules = await loadModules(
      parseEntry(entryPath, source),
      {
        directory: unrelatedWorkspace,
        stdlibSources: new Map([[virtualStdlib, 'public view Text { render Text("Text") }']]),
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
      Path.relative(Path.dirname(entryPath), virtualStdlib),
    ].sort())
  }, { finally: () => FileSystem.rm(unrelatedWorkspace, { recursive: true, force: true }) })
})

async function createProject(): Promise<string> {
  const root = Artifacts.resolvePath('tmp', `module-loader-${Platform.randomUUID()}`)
  await FileSystem.mkdir(Path.join(root, '.tao'), { recursive: true })
  return root
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
