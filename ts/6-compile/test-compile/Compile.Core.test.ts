import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Client from '@runtime/client'
import { Scope } from '@runtime/client'
import * as Tests from '@shared-tests'
import * as Typecheck from '@typecheck'
import * as Workspace from '@workspace'

import { NewlineCharacter, S } from '@shared'
import { FS, Path, Repo } from '@shared/os'

import { compile } from '../compile-src/Compile'
import { executeGeneratedFiles, transpileGeneratedFiles } from './Compile.test-utils'

Tests.test('Preview performance fixture generates generic runtime calls and authored native injections', async () => {
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  const tree = Grammar.createParser().parse(source)
  const document = AST.transform(tree)!
  const entryPath = Repo.resolvePath('ts/perf/perf-fixtures/Performance/Performance.tao')
  const program = await linkedUIProgram(entryPath, document)
  const code = combineGeneratedText(compile(document, { revision: 'test-1', program }))
  Tests.expect(code).toContain('TR.ViewDeclaration("Text", ["Value"]')
  Tests.expect(code).toContain('_Imported_Col["Col"]')
  Tests.expect(code).toContain('<Tao.Text>{Value}</Tao.Text>')
  Tests.expect(code.includes('TR.finishViewRender(_Render, useTaoInjection')).toBe(true)
  Tests.expect(code).not.toContain('function TaoInjection')
  Tests.expect(code).not.toContain('TR.RenderInjectStatement')
  Tests.expect(code).toContain('TR.AppDeclaration(_scope0["Preview"], "test-1")')
  Tests.expect(code).toContain("Children: TR.ViewComponentProps['children']")
})

Tests.test('foreign views compile to named imports and the runtime foreign-view adapter', () => {
  const source = S`
    app Calendar { root FormattedDate }
    public view FormattedDate(Value text) from ./FormattedDate.tsx
  `
  const document = AST.transform(Grammar.createParser().parse(source))!
  const code = combineGeneratedText(compile(document, {
    revision: 'foreign-view',
    resolveForeignViewPath: (modulePath, authoredPath) => `${modulePath}:${authoredPath}`,
  }))

  Tests.expect(code).toContain('import { FormattedDate as _taoForeignView0 } from "<memory>:./FormattedDate.tsx";')
  Tests.expect(code).toContain('TR.ForeignView("FormattedDate", ["Value"], _taoForeignView0, _Scope)')
})

Tests.test('foreign views reject non-text parameter contracts', () => {
  const source = 'app Calendar { root FormattedDate } view FormattedDate(Value number) from ./FormattedDate.tsx'
  const document = AST.transform(Grammar.createParser().parse(source))!

  Tests.expect(() => compile(document, { revision: 'foreign-view-type' }))
    .toThrow('parameters must all use text or boolean')
})

Tests.test('folder-visible apps register root views for sibling lazy bindings', () => {
  const helloPath = '/hello.tao'
  const interactionsPath = '/interactions.tao'
  const hello = AST.transform(
    Grammar.createParser().parse(S`
      app HelloWorld { root RootView }
      view RootView { render inject \`\`\`ts return null \`\`\` }
    `),
  )!
  const interactions = AST.transform(
    Grammar.createParser().parse(S`
      app Interactions { root Form }
      view Form { render inject \`\`\`ts return null \`\`\` }
    `),
  )!
  const program = Typecheck.linkModules(helloPath, [
    { path: helloPath, document: hello, imports: [], siblings: [interactionsPath] },
    { path: interactionsPath, document: interactions, imports: [], siblings: [helloPath] },
  ])
  const code = combineGeneratedText(compile(hello, { revision: 'folder-apps', program }))
  Tests.expect(code).toContain('TR.AliasBinding(_Scope, "HelloWorld", () => _Scope["RootView"]);')
  Tests.expect(code).toContain('TR.AliasBinding(_Scope, "Interactions", () => _Scope["Form"]);')
  Tests.expect(code).toContain(
    'TR.AliasBinding(_Scope, "Interactions", () => _Modules["source/interactions.ts"]!["Interactions"]);',
  )
})

Tests.test('app registration waits until its root alias is initialized', () => {
  const source = S`
    app Main { root Alias }
    view Root { render inject \`\`\`ts return null \`\`\` }
    let Copy = Main
    let Alias = Root
  `
  const scopes: Record<string, unknown>[] = []
  const execution = executeGeneratedFiles(compileSource(source), createRuntime(scopes))
  const root = (execution.default as () => { name: string })()
  Tests.expect(root.name).toBe('Root')
  Tests.expect(scopes[0]!['Copy']).toBe(scopes[0]!['Alias'])
})

Tests.test('generated bootstrap initializes imported values before entry values', () => {
  const parser = Grammar.createParser()
  const entryPath = '/app/Main.tao'
  const valuePath = '/app/Values.tao'
  const entry = AST.transform(parser.parse(S`
    use ./Values Value
    app Main { root Root }
    view Root { render inject \`\`\`ts return null \`\`\` }
    let Copy = Value
  `))!
  const values = AST.transform(parser.parse('public let Value = "ready"'))!
  const statement = AST.GetImportStatements(entry)[0]!
  const program = Typecheck.linkModules(entryPath, [
    {
      path: entryPath,
      document: entry,
      imports: [{ statement, targets: [{ path: valuePath, relation: 'same-directory' }] }],
      siblings: [],
    },
    { path: valuePath, document: values, imports: [], siblings: [] },
  ])
  const scopes: Record<string, unknown>[] = []
  const execution = executeGeneratedFiles(compile(entry, { revision: 'global-values', program }), createRuntime(scopes))
  const root = (execution.default as () => { name: string })()

  Tests.expect(root.name).toBe('Root')
  Tests.expect(scopes[0]!['Copy']).toBe('ready')
})

Tests.test('Kitchen Sink compiles parameter forwarding, capture aliases and nested children', async () => {
  const source = await FS.readFile(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), 'utf8')
  const tree = Grammar.createParser().parse(source)
  const document = AST.transform(tree)
  Tests.expect(document).toBeDefined()
  const entryPath = Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao')
  const program = await linkedUIProgram(entryPath, document!)
  const code = combineGeneratedText(compile(document!, { revision: 'kitchen-sink', program }))
  Tests.expect(code).toContain('TR.ViewDeclaration("Pair", ["First", "Second"]')
  Tests.expect(code).toContain('TR.ViewRenderArguments([_Scope["FirstCaption"]], [])')
  Tests.expect(code).toContain('TR.ViewRenderArguments([_Scope["Title"]], [])')
  Tests.expect(code).toContain("Caption: string, Children: TR.ViewComponentProps['children']")
  Tests.expect(code).toContain('TR.AppDeclaration(_scope0["RootView"], "kitchen-sink")')
})

Tests.test('linked modules preserve owner scopes, lazy aliases and view cycles', () => {
  const { entry, program } = cyclicModuleFixture()
  const files = compile(entry, { revision: 'modules', program })
  const code = combineGeneratedText(files)

  Tests.expect(code).toContain('const _scope0 = TR.Scope() as Source0.Scope;')
  Tests.expect(code).toContain('const _scope1 = TR.Scope() as Source1.Scope;')
  Tests.expect(code).toContain('TR.AliasBinding(_Scope, "UI.Root", () => _Modules["source/common.ts"]!["Root"]);')
  Tests.expect(code).toContain('TR.AliasBinding(_Scope, "Entry.Shared", () => _Modules["source/entry.ts"]!["Shared"]);')
  Tests.expect(code).toContain('TR.AliasBinding(_Scope, "LocalShared", () => _Modules["source/entry.ts"]!["Shared"]);')
  Tests.expect(code).toContain('_Scope["UI.Root"]')
  Tests.expect(code).toContain('_Imported_Entry$Shared["Shared"]')
  Tests.expect(code).toContain('TR.LetDeclaration(_Scope, "Shared", TR.ViewDeclaration("Shared"')
  Tests.expect(code).toContain('TR.LetDeclaration(_Scope, "Root", TR.ViewDeclaration("Root"')
  Tests.expect(code).toContain('TR.AppDeclaration(_scope0["UI.Root"], "modules")')
  Tests.expect(files['App.tsx']!.indexOf('bindDeclarations')).toBeLessThan(
    files['App.tsx']!.indexOf('initializeCaption'),
  )
  Tests.expect(code).not.toContain('const _views')

  const importedApp = combineGeneratedText(compile(entry, { revision: 'selected-app', app: 'UI.Extra', program }))
  Tests.expect(importedApp).toContain('TR.AppDeclaration(_scope1["Root"], "selected-app")')
})

function cyclicModuleFixture(): { entry: AST.Document; program: Typecheck.LinkedProgram } {
  const entry = AST.transform(
    Grammar.createParser().parse(S`
      use package @common as UI
      use ./entry Shared as LocalShared
      app Main { root UI.Root }
      view Shared { render UI.Root }
      let Caption = "module value"
    `),
  )!
  const common = AST.transform(
    Grammar.createParser().parse(S`
      use ./entry Shared as Entry
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
          imports: [],
          bindings: [
            { name: 'UI.Root', source: '/common', target: 'Root' },
            { name: 'UI.Extra', source: '/common', target: 'Extra' },
            { name: 'LocalShared', source: '/entry', target: 'Shared' },
          ],
        },
        {
          path: '/common',
          document: common,
          imports: [],
          bindings: [{ name: 'Entry.Shared', source: '/entry', target: 'Shared' }],
        },
      ],
      definitions: [{
        source: '/entry',
        declaration: AST.FindLetDeclaration(entry.root.block.statements)!,
      }],
    },
  }
}

Tests.test('standalone compilation rejects unresolved use statements', () => {
  const tree = Grammar.createParser().parse(S`
    use package @common as UI
    app Main { root UI.Root }
  `)
  const document = AST.transform(tree)!

  Tests.expect(() => compile(document, { revision: 'standalone' })).toThrow('linked program')
})

Tests.test('injection locals and captures cannot collide with generated callback bindings', () => {
  const source = S`
    app Test { root Root }
    view Root { render inject Value, Children @@children \`\`\`ts
      const _taoValues = Value;
      const _taoChildren = Children;
      return _taoValues + _taoChildren;
    \`\`\` }
  `
  Tests.expect(() => transpileGeneratedFiles(compileSource(source))).not.toThrow()
})

Tests.test('injection captures cannot shadow the generated runtime', () => {
  for (const capture of ['TR', 'Tao']) {
    const source = S`
      app Test { root Root }
      view Root { render inject ${capture} Value \`\`\`ts return ${capture} \`\`\` }
    `
    Tests.expect(() => compileSource(source)).toThrow(`Injection capture name ${capture} conflicts`)
  }
})

Tests.test('contextual TypeScript keywords remain valid as handwritten injection locals', () => {
  const source = S`
    app Test { root Root }
    view Root { render inject Value \`\`\`ts
      const string = Value;
      const type = string;
      const namespace = type;
      return namespace;
    \`\`\` }
  `
  Tests.expect(() => transpileGeneratedFiles(compileSource(source))).not.toThrow()
})

Tests.test('escaped authored identifiers stay inside their own injection scope', () => {
  const source = S`
    app Test { root Root }
    view Root { render inject \`\`\`ts
      const _tao\\u0056alues = 'ok';
      return _tao\\u0056alues;
    \`\`\` }
  `
  Tests.expect(() => transpileGeneratedFiles(compileSource(source))).not.toThrow()
})

function compileSource(source: string): Readonly<Record<string, string>> {
  const tree = Grammar.createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  return compile(AST.transform(tree)!, { revision: 'hygiene' })
}

function combineGeneratedText(files: Readonly<Record<string, string>>): string {
  return Object.values(files).join(NewlineCharacter)
}

function createRuntime(scopes: Record<string, unknown>[]) {
  return {
    ...Client,
    Scope(parent?: Scope) {
      const scope = Client.Scope(parent)
      scopes.push(scope as Record<string, unknown>)
      return scope
    },
    ViewDeclaration: Client.ViewDeclaration,
    ModuleApplied() {},
    AppDeclaration: (view: unknown) => view,
  }
}

async function linkedUIProgram(
  entryPath: string,
  document: AST.Document,
): Promise<Typecheck.LinkedProgram> {
  const sources = await Workspace.loadModules({ path: entryPath, document }, {
    directory: Path.dirname(entryPath),
    resolveProject: async (_importer, alias) =>
      alias === 'tao' ? { root: Repo.resolvePath('ts/stdlib/stdlib-src') } : undefined,
  }, Grammar.createParser())
  return Typecheck.linkModules(entryPath, sources)
}
