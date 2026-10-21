import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import * as RuntimeScope from '@runtime/Scope'
import { ViewDefinition, ViewReference } from '@runtime/View'
import { Errors, S } from '@shared'
import { FileSystem, Path, Repo, Tests } from '@shared/os'
import { linkModules } from '@typecheck/LinkModules'
import type { LinkedProgram, SourceModule } from '@typecheck/Modules'
import { compile } from '../compile-src/Compile'

Tests.test('Hello World generates generic runtime calls and authored native injections', async () => {
  const source = await Tests.readApp('Hello World')
  const tree = createParser().parse(source)
  const document = transform(tree)!
  const entryPath = Repo.resolvePath('Apps/Tests/Hello World.tao')
  const root = document.root.declarations.find(AST.IsViewDeclaration)!.render
  if (!AST.IsViewRender(root)) {
    Errors.ThrowUnexpected('Expected a root render.')
  }
  const program = await linkedUIProgram(entryPath, document)
  const code = compile(document, { revision: 'test-1', program })
  Tests.expect(code).toContain('TR.ViewDefinition("Text", ["Value"]')
  Tests.expect(code).toContain(`TR.ViewReference(_taoValues, ${JSON.stringify(root.target.value)})`)
  Tests.expect(code).toContain('<TR.ReactNative.Text>{Value}</TR.ReactNative.Text>')
  Tests.expect(code).toContain('TR.App(TR.ViewReference(_scope0, "RootView"), "test-1")')
  Tests.expect(code).toContain('const Children = _taoChildren;')
})

Tests.test('foreign views compile to named imports and the runtime foreign-view adapter', () => {
  const source = S`
    app Calendar { root FormattedDate }
    public view FormattedDate(Value text) from ./FormattedDate.tsx
  `
  const document = transform(createParser().parse(source))!
  const code = compile(document, {
    revision: 'foreign-view',
    foreignViewPath: (modulePath, authoredPath) => `${modulePath}:${authoredPath}`,
  })

  Tests.expect(code).toContain('import { FormattedDate as _taoForeignView0 } from "<memory>:./FormattedDate.tsx";')
  Tests.expect(code).toContain('TR.ForeignView("FormattedDate", ["Value"], _taoForeignView0, _scope0)')
})

Tests.test('foreign views reject non-text parameter contracts', () => {
  const source = 'app Calendar { root FormattedDate } view FormattedDate(Value number) from ./FormattedDate.tsx'
  const document = transform(createParser().parse(source))!

  Tests.expect(() => compile(document, { revision: 'foreign-view-type' }))
    .toThrow('parameters must all use the text type')
})

Tests.test('folder-visible apps register root views for sibling lazy bindings', () => {
  const helloPath = '/hello.tao'
  const interactionsPath = '/interactions.tao'
  const hello = transform(
    createParser().parse(S`
      app HelloWorld { root RootView }
      view RootView { render inject \`\`\`ts return null \`\`\` }
    `),
  )!
  const interactions = transform(
    createParser().parse(S`
      app Interactions { root Form }
      view Form { render inject \`\`\`ts return null \`\`\` }
    `),
  )!
  const program = linkModules(helloPath, [
    { path: helloPath, document: hello, imports: [], siblings: [interactionsPath] },
    { path: interactionsPath, document: interactions, imports: [], siblings: [helloPath] },
  ])
  const code = compile(hello, { revision: 'folder-apps', program })
  Tests.expect(code).toContain('TR.LetReference(_scope0, "HelloWorld", () => TR.ViewReference(_scope0, "RootView"));')
  Tests.expect(code).toContain('TR.LetReference(_scope1, "Interactions", () => TR.ViewReference(_scope1, "Form"));')
  Tests.expect(code).toContain('TR.LetReference(_scope0, "Interactions", () => TR.Value(_scope1, "Interactions"));')
})

Tests.test('app registration waits until its root alias is initialized', () => {
  const source = S`
    app Main { root Alias }
    view Root { render inject \`\`\`ts return null \`\`\` }
    let Copy = Main
    let Alias = Root
  `
  const execute = new Function('TR', generatedJavaScript(source) + '\nreturn TR.Value(_scope0, "Copy");')
  const root = execute({ ...RuntimeScope, ViewDefinition, ViewReference, ModuleApplied() {} })
  Tests.expect(root.name).toBe('Root')
  Tests.expect(root.render()).toBeNull()
})

Tests.test('Kitchen Sink compiles parameter forwarding, capture aliases and nested children', async () => {
  const source = await FileSystem.readFile(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), 'utf8')
  const tree = createParser().parse(source)
  const document = transform(tree)
  Tests.expect(document).toBeDefined()
  const entryPath = Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao')
  const program = await linkedUIProgram(entryPath, document!)
  const code = compile(document!, { revision: 'kitchen-sink', program })
  Tests.expect(code).toContain('TR.ViewDefinition("Pair", ["First", "Second"]')
  Tests.expect(code).toContain('TR.ViewRenderArgs([TR.Value(_taoValues, "FirstCaption")], [])')
  Tests.expect(code).toContain('const Caption = TR.Value(_taoValues, "Title") as string;')
  Tests.expect(code).toContain('const Children = _taoChildren;')
  Tests.expect(code).toContain('TR.App(TR.ViewReference(_scope0, "RootView"), "kitchen-sink")')
})

Tests.test('linked modules preserve owner scopes, lazy aliases and view cycles', () => {
  const { entry, program } = cyclicModuleFixture()
  const code = compile(entry, { revision: 'modules', program })

  Tests.expect(code).toContain('const _scope0 = TR.Scope();')
  Tests.expect(code).toContain('const _scope1 = TR.Scope();')
  Tests.expect(code).toContain('TR.LetReference(_scope0, "UI.Root", () => TR.Value(_scope1, "Root"));')
  Tests.expect(code).toContain('TR.LetReference(_scope1, "Entry.Shared", () => TR.Value(_scope0, "Shared"));')
  Tests.expect(code).toContain('TR.LetReference(_scope0, "LocalShared", () => TR.Value(_scope0, "Shared"));')
  Tests.expect(code).toContain('TR.ViewReference(_taoValues, "UI.Root")')
  Tests.expect(code).toContain('TR.ViewReference(_taoValues, "Entry.Shared")')
  Tests.expect(code).toContain('TR.LetDefinition(_scope0, "Shared", TR.ViewDefinition("Shared"')
  Tests.expect(code).toContain('TR.LetDefinition(_scope1, "Root", TR.ViewDefinition("Root"')
  Tests.expect(code).toContain('TR.App(TR.ViewReference(_scope0, "UI.Root"), "modules")')
  Tests.expect(code.indexOf('TR.ViewDefinition("Root"')).toBeLessThan(code.indexOf('"Caption", "module value"'))
  Tests.expect(code).not.toContain('_views')

  const importedApp = compile(entry, { revision: 'selected-app', app: 'UI.Extra', program })
  Tests.expect(importedApp).toContain('TR.App(TR.ViewReference(_scope1, "Root"), "selected-app")')
})

function cyclicModuleFixture(): { entry: AST.Document; program: LinkedProgram } {
  const entry = transform(
    createParser().parse(S`
      use package @common as UI
      use Shared as LocalShared from ./entry
      app Main { root UI.Root }
      view Shared { render UI.Root }
      let Caption = "module value"
    `),
  )!
  const common = transform(
    createParser().parse(S`
      use Shared as Entry from ./entry
      app Extra { root Root }
      view Root { render Entry.Shared }
    `),
  )!
  return {
    entry,
    program: {
      entry: '/entry',
      modules: [
        {
          path: '/entry',
          document: entry,
          bindings: [
            { name: 'UI.Root', source: '/common', target: 'Root' },
            { name: 'UI.Extra', source: '/common', target: 'Extra' },
            { name: 'LocalShared', source: '/entry', target: 'Shared' },
          ],
        },
        {
          path: '/common',
          document: common,
          bindings: [{ name: 'Entry.Shared', source: '/entry', target: 'Shared' }],
        },
      ],
      definitions: [{
        source: '/entry',
        declaration: entry.root.declarations.find(AST.IsLetDefinition)!,
      }],
    },
  }
}

Tests.test('standalone compilation rejects unresolved use statements', () => {
  const tree = createParser().parse('use package @common as UI\napp Main { root UI.Root }')
  const document = transform(tree)!

  Tests.expect(() => compile(document, { revision: 'standalone' })).toThrow('linked program')
})

Tests.test('injection locals and captures cannot collide with generated callback bindings', () => {
  const source = S`
    app Test { root Root }
    view Root { render inject _values Value, _children @@children \`\`\`ts
      const _taoValues = _values;
      const _taoChildren = _children;
      return _taoValues + _taoChildren;
    \`\`\` }
  `
  Tests.expect(() => new Function(generatedJavaScript(source))).not.toThrow()
})

Tests.test('injection captures cannot shadow the runtime or use reserved JavaScript names', () => {
  for (const capture of ['TR', 'return']) {
    const source =
      `app Test { root Root }\nview Root { render inject ${capture} Value \`\`\`ts return ${capture} \`\`\` }`
    Tests.expect(() => generatedJavaScript(source)).toThrow(`Injection capture name ${capture} conflicts`)
  }
})

Tests.test('escaped authored identifiers stay inside their own injection scope', () => {
  const source = S`
    app Test { root Root }
    view Root { render inject \`\`\`ts
      const _tao\\u0056alues = 'ok';
      return _tao\\u0056alues;
    \`\`\` }
  `
  Tests.expect(() => new Function(generatedJavaScript(source))).not.toThrow()
})

function generatedJavaScript(source: string): string {
  const tree = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  return compile(transform(tree)!, { revision: 'hygiene' })
    .replace(/^import \* as TR from '@runtime';\n/m, '')
    .replace('export default function App()', 'function App()')
}

async function linkedUIProgram(
  entryPath: string,
  document: AST.Document,
): Promise<ReturnType<typeof linkModules>> {
  const uiPath = Repo.resolvePath('ts/stdlib/stdlib-src/@ui/Views.tao')
  const uiSource = await FileSystem.readFile(uiPath, 'utf8')
  const uiDocument = transform(createParser().parse(uiSource))!
  const modulesPath = Path.join(Path.dirname(entryPath), 'Modules.tao')
  const modulesDocument = FileSystem.existsSync(modulesPath)
    ? transform(createParser().parse(await FileSystem.readFile(modulesPath, 'utf8')))
    : undefined
  const imports: SourceModule['imports'][number][] = document.root.declarations
    .filter((node): node is SourceModule['imports'][number]['statement'] =>
      AST.IsUseStatement(node) || AST.IsUsePackageStatement(node)
    )
    .map(statement => {
      const from = AST.IsUsePackageStatement(statement) ? statement.from.value : statement.from?.value
      const isUI = from === 'tao@ui'
      return {
        statement,
        targets: [{ path: isUI ? uiPath : modulesPath, relation: isUI ? 'public' : 'same-directory' }],
      }
    })
  const sources: SourceModule[] = [
    { path: entryPath, document, imports, siblings: modulesDocument ? [modulesPath] : [] },
    { path: uiPath, document: uiDocument, imports: [], siblings: [] },
  ]
  if (modulesDocument) {
    sources.push({ path: modulesPath, document: modulesDocument, imports: [], siblings: [] })
  }
  return linkModules(entryPath, sources)
}
