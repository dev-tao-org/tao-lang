import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'
import type * as Typecheck from '@typecheck'

import { S, Try } from '@shared'
import { Artifacts, FS, Path, Platform } from '@shared/os'

import { loadModules } from '../workspace-src/modules/Loader'

const AmbiguousProjectPackageErrorRegx = /Package @ui is ambiguous/
const MissingProjectModuleErrorRegx = /Project module tao@missing was not found/
const MissingLocalPackageErrorRegx = /Package @ui was not found/

Tests.test('project imports resolve through consumer aliases and producer-local aliases', async () => {
  const consumer = await createProject('consumer')
  const producer = await createProject('producer')
  const icons = await createProject('icons')
  await Try(async () => {
    const paths = await writeProjectImportSources(producer, icons)
    const modules = await loadProjectImportGraph(consumer, producer, icons)
    assertProjectImportGraph(modules, paths)
  }, {
    async finally() {
      await FS.rm(consumer, { recursive: true, force: true })
      await FS.rm(producer, { recursive: true, force: true })
      await FS.rm(icons, { recursive: true, force: true })
    },
  })
})

Tests.test('project module imports reject ambiguous nested package roots', async () => {
  const consumer = await createProject('ambiguous-consumer')
  const producer = await createProject('ambiguous-producer')
  const icons = await createProject('ambiguous-icons')
  await Try(async () => {
    await writeSource(
      Path.join(producer, 'packages', '@ui', 'controls', 'Card.tao'),
      'view Card { render Text("Card") }',
    )
    await writeSource(
      Path.join(producer, 'packages', '@ui', 'examples', '@ui', 'controls', 'Card.tao'),
      'view Card { render Text("Card") }',
    )
    await Tests.rejects(
      loadProjectImportGraph(consumer, producer, icons),
      AmbiguousProjectPackageErrorRegx,
    )
  }, {
    async finally() {
      await FS.rm(consumer, { recursive: true, force: true })
      await FS.rm(producer, { recursive: true, force: true })
      await FS.rm(icons, { recursive: true, force: true })
    },
  })
})

type ProjectImportPaths = { card: string; caption: string; unrelated: string; label: string }

async function writeProjectImportSources(producer: string, icons: string): Promise<ProjectImportPaths> {
  const paths = {
    card: Path.join(producer, 'packages', '@ui', 'controls', 'Card.tao'),
    caption: Path.join(producer, 'packages', '@ui', 'controls', 'Caption.tao'),
    unrelated: Path.join(producer, 'packages', '@ui', 'unused', 'Unused.tao'),
    label: Path.join(icons, '@icons', 'labels', 'Label.tao'),
  }
  await writeSource(
    paths.card,
    S`
      use @ui/controls Caption
      use icons@icons/labels Label
      view Card { render Text("Card") }
    `,
  )
  await writeSource(paths.caption, 'view Caption { render Text("Caption") }')
  await writeSource(paths.unrelated, 'view Unused { render Text("Unused") }')
  await writeSource(paths.label, 'view Label { render Text("Label") }')
  return paths
}

async function loadProjectImportGraph(
  consumer: string,
  producer: string,
  icons: string,
): Promise<Typecheck.SourceModule[]> {
  const entryPath = Path.join(consumer, 'Main.tao')
  return await loadModules(
    parseEntry(
      entryPath,
      S`
        use widgets@ui/controls Card
        app Main { root Card }
      `,
    ),
    {
      directory: consumer,
      resolveProject: projectResolver(consumer, producer, icons).resolveProject,
    },
    Grammar.createParser(),
  )
}

function projectResolver(consumer: string, producer: string, icons: string) {
  return {
    async resolveProject(importer: string, alias: string) {
      if (inside(consumer, importer) && alias === 'widgets') {
        return { root: producer }
      }
      if (inside(producer, importer) && alias === 'icons') {
        return { root: icons }
      }
      return undefined
    },
  }
}

function assertProjectImportGraph(
  modules: Typecheck.SourceModule[],
  paths: ProjectImportPaths,
): void {
  const byPath = new Map(modules.map(module => [module.path, module]))
  Tests.expect(byPath.has(paths.card)).toBe(true)
  Tests.expect(byPath.has(paths.caption)).toBe(true)
  Tests.expect(byPath.has(paths.label)).toBe(true)
  Tests.expect(byPath.has(paths.unrelated)).toBe(false)
  Tests.expect(modules[0]!.imports[0]!.targets).toEqual([
    { path: paths.caption, relation: 'package-api' },
    { path: paths.card, relation: 'package-api' },
  ])
  Tests.expect(byPath.get(paths.card)!.imports[0]!.targets).toEqual([
    { path: paths.caption, relation: 'same-directory' },
    { path: paths.card, relation: 'same-file' },
  ])
  Tests.expect(byPath.get(paths.card)!.imports[1]!.targets).toEqual([{ path: paths.label, relation: 'package-api' }])
}

Tests.test('the implicit tao alias resolves standard library modules from an ordinary project', async () => {
  const root = await createProject('stdlib-import')
  await Try(async () => {
    const standardRoot = Path.join(root, 'stdlib')
    await FS.mkdir(Path.join(standardRoot, '.tao'))
    const sourcePath = Path.join(standardRoot, '@ui', 'Views.tao')
    await writeSource(sourcePath, 'view Text { render Text("Text") }')
    const entryPath = Path.join(root, 'Main.tao')
    const modules = await loadModules(
      parseEntry(
        entryPath,
        S`
          use tao@ui Text
          app Main { root Root }
        `,
      ),
      {
        directory: root,
        resolveProject: async (_importer, alias) =>
          alias === 'tao'
            ? { root: standardRoot }
            : undefined,
      },
      Grammar.createParser(),
    )

    Tests.expect(modules.filter(module => module.path === sourcePath)).toHaveLength(1)
    Tests.expect(modules[0]!.imports.map(imported => imported.targets)).toEqual([
      [{ path: sourcePath, relation: 'package-api' }],
    ])
    Tests.expect((AST.GetDeclarations(modules[1]!.document)[0] as AST.ViewDeclaration).name.value).toBe('Text')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('aliased project imports reject missing physical modules', async () => {
  const consumer = await createProject('missing-consumer')
  const producer = await createProject('missing-producer')
  await Try(async () => {
    await Tests.rejects(
      loadModules(
        parseEntry(
          Path.join(consumer, 'Main.tao'),
          S`
            use tao@missing Item
            app Main { root Root }
          `,
        ),
        {
          directory: consumer,
          resolveProject: async (_importer, alias) => alias === 'tao' ? { root: producer } : undefined,
        },
        Grammar.createParser(),
      ),
      MissingProjectModuleErrorRegx,
    )
  }, {
    async finally() {
      await FS.rm(consumer, { recursive: true, force: true })
      await FS.rm(producer, { recursive: true, force: true })
    },
  })
})

Tests.test('bare named packages never resolve through external project aliases', async () => {
  const consumer = await createProject('local-only')
  const producer = await createProject('external-ui')
  const entry = parseEntry(Path.join(consumer, 'Main.tao'), 'use @ui Text')
  await Try(async () => {
    await writeSource(Path.join(producer, '@ui', 'Text.tao'), 'package view Text { render Text }')
    await Tests.rejects(
      loadModules(entry, {
        directory: consumer,
        resolveProject: async () => ({ root: producer }),
      }, Grammar.createParser()),
      MissingLocalPackageErrorRegx,
    )
  }, {
    async finally() {
      await FS.rm(consumer, { recursive: true, force: true })
      await FS.rm(producer, { recursive: true, force: true })
    },
  })
})

async function createProject(name: string): Promise<string> {
  const root = Artifacts.resolvePath('tmp', `module-${name}-${Platform.randomUUID()}`)
  await FS.mkdir(Path.join(root, '.tao'))
  return root
}

function inside(root: string, path: string): boolean {
  const relative = Path.relative(root, path).replaceAll('\\', '/')
  return relative !== '..' && !relative.startsWith('../') && !Path.isAbsolute(relative)
}

async function writeSource(path: string, source: string): Promise<void> {
  await FS.mkdir(Path.dirname(path))
  await FS.writeFile(path, source)
}

function parseEntry(path: string, source: string): { path: string; document: AST.Document } {
  const document = AST.transform(Grammar.createParser().parse(source))
  Tests.expect(document).toBeDefined()
  return { path, document: document! }
}
