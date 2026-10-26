import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { S } from '@shared'
import { Tests } from '@shared/os'
import { linkModules } from '@typecheck/LinkModules'
import { compile } from '../compile-src/Compile'
import { createGeneratedPaths } from '../compile-src/GeneratedPaths'

Tests.test('generated source files own stable components while revision changes stay in bootstrap', () => {
  const document = transform(
    createParser().parse(S`
      app Main { root Root }
      view Root { render inject \`\`\`ts return null \`\`\` }
    `),
  )!
  const first = compile(document, { revision: 'first' })
  const second = compile(document, { revision: 'second' })
  Tests.expect(Object.keys(first).sort()).toEqual(['App.tsx', 'source/Memory.ts', 'source/Memory.views.tsx'])
  Tests.expect(first['source/Memory.ts']).toBe(second['source/Memory.ts'])
  Tests.expect(first['source/Memory.views.tsx']).toBe(second['source/Memory.views.tsx'])
  Tests.expect(first['App.tsx']).not.toBe(second['App.tsx'])
  Tests.expect(first['source/Memory.views.tsx']).toContain('export function TaoView_Root_')
  Tests.expect(first['source/Memory.views.tsx']).not.toContain('TR.ModuleApplied')
})

Tests.test('source names with category suffixes cannot shadow another input component module', () => {
  const document = transform(
    createParser().parse('app Main { root Root } view Root { render inject ```ts return null ``` }'),
  )!
  const paths = createGeneratedPaths({
    entry: '/app/Foo.tao',
    modules: [
      { path: '/app/Foo.tao', document, bindings: [] },
      { path: '/app/Foo.views.tao', document, bindings: [] },
    ],
    definitions: [],
  })
  Tests.expect(paths.get('/app/Foo.tao')).toBe('source/Foo.ts')
  Tests.expect(paths.get('/app/Foo.views.tao')).toMatch(/^source\/Foo\.views\.source-[a-f0-9]{8}\.ts$/)
})

Tests.test('split initialization binds every module before globally ordered values', () => {
  const parser = createParser()
  const entry = transform(parser.parse(S`
    use Value from ./Other
    app Main { root Root }
    view Root { render inject \`\`\`ts return null \`\`\` }
    let Copy = Value
  `))!
  const other = transform(parser.parse('public let Value = "ready"'))!
  const statement = AST.GetImportStatements(entry)[0]!
  const program = linkModules('/app/Main.tao', [
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
  Tests.expect(files['source/Main.ts']).toContain('Pick<ImportedScope0, "Value">')
  Tests.expect(files['source/Main.ts']).not.toContain('"ready"')
  Tests.expect(files['source/Other.ts']).toContain('"ready"')
})
