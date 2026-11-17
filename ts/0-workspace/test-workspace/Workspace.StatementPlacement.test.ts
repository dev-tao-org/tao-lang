import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import { S, Source, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { resolveDependencyLockPath } from '../workspace-src/dependencies/LockFile'
import * as Workspace from '../workspace-src/Workspace'

const PlacementMessage = 'Root declarations belong directly inside an app.'
const LibraryPlacementRegx = /Root declarations belong directly inside an app\./
const RootRender = 'render inject ```ts return null ```'

const MisplacedRoot = 'root Main'

Tests.test('dependency readiness rejects misplaced statements before inspecting runtime setup', async () => {
  const directory = Artifacts.resolvePath('tmp', `setup-placement-${Platform.randomUUID()}`)
  const entry = Path.join(directory, 'Main.tao')
  const source = S`
    app Example { root Main }
    view Main {
      ${MisplacedRoot}
      ${RootRender}
    }
  `
  await Try(async () => {
    await Workspace.createProject({ directory })
    await FS.writeFile(entry, source)
    await Tests.rejects(Workspace.inspectProjectPreparation(entry, { runtime: false }), LibraryPlacementRegx)
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

Tests.test('setup diagnoses invalid siblings before resolving their imports', async () => {
  const directory = Artifacts.resolvePath('tmp', `sibling-placement-${Platform.randomUUID()}`)
  const feature = Path.join(directory, 'Feature')
  const entry = Path.join(feature, 'Main.tao')
  const source = S`
    view Broken {
      root Broken
      ${RootRender}
    }
  `
  const main = S`
    app Example { root Main }
    view Main { ${RootRender} }
  `
  await Try(async () => {
    await Workspace.createProject({ directory })
    await FS.mkdir(feature)
    await FS.writeFile(entry, main)
    await FS.writeFile(Path.join(feature, 'A.tao'), 'use missing@widgets Widget')
    await FS.writeFile(Path.join(feature, 'Z.tao'), source)
    await Tests.rejects(Workspace.inspectProjectPreparation(entry, { runtime: false }), LibraryPlacementRegx)
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

Tests.test('misplaced statements retain their AST ranges and block app publication until corrected', async () => {
  const source = S`
    use tao@ui Text

    app Example { root Main }
    view Main {
      root Main
      render Text("Hello")
    }
  `
  const parser = Grammar.createParser()
  const tree = parser.parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  const document = AST.transform(tree)!
  const view = AST.GetViewDeclarations(document)[0]!
  Tests.expect(view.body).toMatchObject({
    kind: 'Block',
    statements: [{ kind: 'RootDeclaration' }, { kind: 'RenderViewExpressionStatement' }],
  })
  const misplaced = view.body.kind === 'Block' && view.body.statements[0]!
  Tests.expect(misplaced && Source.slice(source, misplaced)).toBe(MisplacedRoot)
  const workspace = Workspace.createWorkspace({})
  await Try(async () => {
    const outcome = await workspace.update(source)
    Tests.expect(outcome.status).toBe('failed')
    Tests.expect(outcome.status === 'failed' && outcome.error).toContain(PlacementMessage)
    Tests.expect(outcome.timings.some(timing => timing.name === 'compiler.generate')).toBe(false)
    Tests.expect(workspace.lastGoodRevision).toBeUndefined()
    Tests.expect(await workspace.update(source.replace('root Main\n', '')))
      .toMatchObject({ status: 'published' })
    const unfinished = source.slice(0, source.lastIndexOf('}'))
    Tests.expect(parser.parse(unfinished).rootNode.hasError).toBe(true)
    Tests.expect(await workspace.update(unfinished)).toMatchObject({ status: 'invalid' })
    Tests.expect(workspace.lastGoodRevision).toBe('r2')
  }, { finally: () => workspace.dispose() })
})

Tests.test('library compilation rejects misplaced statements before reading dependency state or emitting a package', async () => {
  const directory = Artifacts.resolvePath('tmp', `library-placement-${Platform.randomUUID()}`)
  const entry = Path.join(directory, 'Library.tao')
  const output = Path.join(directory, 'output')
  const source = S`
    ts-library Demo { publish { Main } }
    package view Main {
      root Main
      ${RootRender}
    }
  `
  await Try(async () => {
    await Workspace.createProject({ directory })
    await FS.writeFile(entry, source)
    await FS.writeFile(resolveDependencyLockPath(directory), 'corrupt')
    await Tests.rejects(
      Workspace.compileLibraryPackage({ entry, out: output, name: '@example/placement' }),
      LibraryPlacementRegx,
    )
    Tests.expect(await FS.exists(output)).toBe(false)
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

Tests.test('source validation reports required statements, view ordering and expectation placement together', async () => {
  const source = S`
    app Example { root Main root Other }
    view Main {
      view Early { ${RootRender} }
      ${RootRender}
      let Late = "value"
      render Early
      package view Exposed { ${RootRender} }
    }
    ts-library Demo {}
    tests { test { expect { #save input value "Ready" } } }
    test { render Main }
  `
  const parser = Grammar.createParser()
  Tests.expect(parser.parse(source).rootNode.hasError).toBe(false)
  const workspace = Workspace.createWorkspace({})
  await Try(async () => {
    const outcome = await workspace.update(source)
    Tests.expect(outcome.status).toBe('failed')
    const error = outcome.status === 'failed' ? outcome.error : ''
    Tests.expect(error).toContain('An app must contain exactly one root declaration.')
    Tests.expect(error).toContain('A nested view must follow its owner’s render statement.')
    Tests.expect(error).toContain('A local let declaration must precede its view’s render statement.')
    Tests.expect(error).toContain('A view must contain exactly one render statement.')
    Tests.expect(error).toContain('A nested view is private to its owner and cannot specify visibility.')
    Tests.expect(error).toContain('A ts-library must contain exactly one publish declaration.')
    Tests.expect(error).toContain('A tagged input expectation belongs immediately after expect.')
    Tests.expect(error).toContain('Test cases belong directly inside a tests suite.')
    Tests.expect(error).toContain('Render statements belong directly inside a view.')
    Tests.expect(error).toContain(`offset ${source.indexOf('root Other')}`)
  }, { finally: () => workspace.dispose() })
})

Tests.test('lowercase declarations keep their syntax and block compilation at the authored name', async () => {
  const source = S`
    app Example { root Main }
    view Main { render Helper }
    view helper { ${RootRender} }
  `
  Tests.expect(Grammar.createParser().parse(source).rootNode.hasError).toBe(false)
  const workspace = Workspace.createWorkspace({})
  await Try(async () => {
    const invalid = await workspace.update(source)
    Tests.expect(invalid.status).toBe('failed')
    const error = invalid.status === 'failed' ? invalid.error : ''
    Tests.expect(error).toContain("Declared name 'helper' must start with an uppercase letter.")
    Tests.expect(error).toContain(`offset ${source.indexOf('helper')}`)
    const corrected = source.replace('view helper', 'view Helper')
    Tests.expect(await workspace.update(corrected)).toMatchObject({ status: 'published' })
  }, { finally: () => workspace.dispose() })
})
