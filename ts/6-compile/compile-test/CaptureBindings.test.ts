import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import * as RuntimeScope from '@runtime/client/Scope'
import * as RuntimeView from '@runtime/client/View'
import { S } from '@shared'
import { Tests } from '@shared/os'
import { linkModules } from '@typecheck/LinkModules'
import { compile } from '../compile-src/Compile'
import { executeGeneratedFiles } from './GeneratedExecution'

Tests.test('imported prototype-named text retains its value through an aliased injection capture', () => {
  const files = compileImportedRoot(
    'render inject Captured Imported ```ts return Captured ```',
    'public let __proto__ = "Captured value"',
  )
  Tests.expect(renderRoot(files)).toBe('Captured value')
})

Tests.test('imported prototype-named views retain their descriptor when rendered through an alias', () => {
  const files = compileImportedRoot(
    'render Imported',
    'public view __proto__ { render inject ```ts return null ``` }',
  )
  Tests.expect(renderRoot(files)).toMatchObject({ name: '__proto__', parameters: [] })
})

function compileImportedRoot(render: string, declaration: string): Readonly<Record<string, string>> {
  const parser = createParser()
  const entry = transform(parser.parse(S`
    use __proto__ as Imported from ./Other
    app Main { root Root }
    view Root { ${render} }
  `))!
  const other = transform(parser.parse(declaration))!
  const statement = AST.GetImportStatements(entry)[0]!
  const program = linkModules('/app/Main.tao', [{
    path: '/app/Main.tao',
    document: entry,
    imports: [{ statement, targets: [{ path: '/app/Other.tao', relation: 'same-directory' }] }],
    siblings: [],
  }, { path: '/app/Other.tao', document: other, imports: [], siblings: [] }])
  return compile(entry, { program, revision: 'capture-bindings' })
}

function renderRoot(files: Readonly<Record<string, string>>): unknown {
  const execution = executeGeneratedFiles(files, {
    ...RuntimeScope,
    ViewDeclaration: RuntimeView.ViewDeclaration,
    beginViewRender: RuntimeView.beginViewRender,
    finishViewRender: RuntimeView.finishViewRender,
    ViewRenderArguments: () => ({}),
    ViewRenderExpression: (view: unknown) => view,
    ModuleApplied() {},
    AppDeclaration: (view: unknown) => view,
  })
  const root = (execution.default as () => RuntimeView.View)()
  const render = root.render as (props: RuntimeView.ViewComponentProps) => unknown
  return render({ view: root, scope: RuntimeScope.Scope(root.scope), children: [] })
}
