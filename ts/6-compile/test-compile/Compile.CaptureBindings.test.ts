import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Client from '@runtime/client'
import * as Tests from '@shared-tests'
import * as Typecheck from '@typecheck'

import { S } from '@shared'

import { compile } from '../compile-src/Compile'
import { executeGeneratedFiles } from './Compile.test-utils'

Tests.test('imported text retains its value through an aliased injection capture', () => {
  const files = compileImportedRoot(
    'render inject Captured Imported ```ts return Captured ```',
    'package let Original = "Captured value"',
  )
  Tests.expect(renderRoot(files)).toBe('Captured value')
})

Tests.test('imported views retain their descriptor when rendered through an alias', () => {
  const files = compileImportedRoot(
    'render Imported',
    'package view Original { render inject ```ts return null ``` }',
  )
  Tests.expect(renderRoot(files)).toMatchObject({ name: 'Original', parameters: [] })
})

function compileImportedRoot(render: string, declaration: string): Readonly<Record<string, string>> {
  const parser = Grammar.createParser()
  const entry = AST.transform(parser.parse(S`
    use Original as Imported
    app Main { root Root }
    view Root { ${render} }
  `))!
  const other = AST.transform(parser.parse(declaration))!
  const statement = AST.GetImportStatements(entry)[0]!
  const program = Typecheck.linkModules('/app/Main.tao', [{
    path: '/app/Main.tao',
    document: entry,
    imports: [{ statement, targets: [{ path: '/app/Other.tao', relation: 'same-directory' }] }],
    siblings: [],
  }, { path: '/app/Other.tao', document: other, imports: [], siblings: [] }])
  return compile(entry, { program, revision: 'capture-bindings' })
}

function renderRoot(files: Readonly<Record<string, string>>): unknown {
  const execution = executeGeneratedFiles(files, {
    ...Client,
    ViewDeclaration: Client.ViewDeclaration,
    beginViewRender: Client.beginViewRender,
    finishViewRender: Client.finishViewRender,
    ViewRenderArguments: () => ({}),
    ViewRenderExpression: (view: unknown) => view,
    ModuleApplied() {},
    AppDeclaration: (view: unknown) => view,
  })
  const root = (execution.default as () => Client.View)()
  const render = root.render as (props: Client.ViewComponentProps) => unknown
  return render({ view: root, scope: Client.Scope(root.scope), children: [] })
}
