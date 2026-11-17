import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'
import * as Typecheck from '@typecheck'

import { S } from '@shared'

import { compile } from '../compile-src/Compile'
import { createGeneratedPaths } from '../compile-src/GeneratedPaths'

const GeneratedMemoryViewsPathRegx = /^ts\/packages\/Foo\.views\.source-[a-f0-9]{8}\.ts$/

Tests.test('generated source files own stable components while revision changes stay in bootstrap', () => {
  const document = AST.transform(
    Grammar.createParser().parse(S`
      app Main { root Root }
      view Root { render inject \`\`\`ts return null \`\`\` }
    `),
  )!
  const first = compile(document, { revision: 'first' })
  const second = compile(document, { revision: 'second' })
  Tests.expect(Object.keys(first).sort()).toEqual(['App.tsx', 'ts/packages/Memory.ts', 'ts/packages/Memory.views.tsx'])
  Tests.expect(first['ts/packages/Memory.ts']).toBe(second['ts/packages/Memory.ts'])
  Tests.expect(first['ts/packages/Memory.views.tsx']).toBe(second['ts/packages/Memory.views.tsx'])
  Tests.expect(first['App.tsx']).not.toBe(second['App.tsx'])
  Tests.expect(first['ts/packages/Memory.views.tsx']).toContain('export function TaoView_Root_')
  Tests.expect(first['ts/packages/Memory.views.tsx']).not.toContain('TR.ModuleApplied')
})

Tests.test('source names with category suffixes cannot shadow another input component module', () => {
  const document = AST.transform(
    Grammar.createParser().parse('app Main { root Root } view Root { render inject ```ts return null ``` }'),
  )!
  const paths = createGeneratedPaths({
    entry: '/app/Foo.tao',
    modules: [
      {
        path: '/app/Foo.tao',
        document,
        bindings: [],
        imports: [],
        scalarTypes: Typecheck.createScalarTypeScope(document, '/app/Foo.tao'),
      },
      {
        path: '/app/Foo.views.tao',
        document,
        bindings: [],
        imports: [],
        scalarTypes: Typecheck.createScalarTypeScope(document, '/app/Foo.views.tao'),
      },
    ],
    definitions: [],
  })
  Tests.expect(paths.get('/app/Foo.tao')).toBe('ts/packages/Foo.ts')
  Tests.expect(paths.get('/app/Foo.views.tao')).toMatch(GeneratedMemoryViewsPathRegx)
})

Tests.test('split initialization binds every module before globally ordered values', () => {
  const parser = Grammar.createParser()
  const entry = AST.transform(parser.parse(S`
    use Value
    app Main { root Root }
    view Root { render inject \`\`\`ts return null \`\`\` }
    let Copy = Value
  `))!
  const other = AST.transform(parser.parse('package let Value = "ready"'))!
  const statement = AST.GetImportStatements(entry)[0]!
  const program = Typecheck.linkModules('/app/Main.tao', [
    {
      path: '/app/Main.tao',
      document: entry,
      imports: [{ statement, targets: [{ path: '/app/Other.tao', relation: 'same-directory' }] }],
      siblings: [],
    },
    { path: '/app/Other.tao', document: other, imports: [], siblings: [] },
  ])
  const files = compile(entry, { revision: 'split', program })
  const bootstrap = files['App.tsx']!
  Tests.expect(bootstrap.indexOf('bindDeclarations')).toBeLessThan(bootstrap.indexOf('initializeValue'))
  Tests.expect(bootstrap.indexOf('initializeValue(_scope1')).toBeLessThan(bootstrap.indexOf('initializeCopy(_scope0'))
  Tests.expect(files['ts/packages/Main.ts']).toContain('Pick<ImportedScope0, "Value">')
  Tests.expect(files['ts/packages/Main.ts']).not.toContain('"ready"')
  Tests.expect(files['ts/packages/Other.ts']).toContain('"ready"')
})
