import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Errors, S } from '@shared'
import { FileSystem, Repo, Tests } from '@shared/os'
import { compile } from '../compile-src/Compile'

Tests.test('Hello World generates generic runtime calls and authored native injections', async () => {
  const { tree } = createParser().parse(await Tests.readApp('Hello World'))
  const document = transform(tree)!
  const root = document.root.declarations.find(AST.IsViewDeclaration)!.render
  if (!AST.IsViewRender(root)) {
    Errors.ThrowUnexpected('Expected a root render.')
  }
  const code = compile(document, { revision: 'test-1' })
  Tests.expect(code).toContain('TR.ViewDefinition("Text", ["Value"]')
  Tests.expect(code).toContain(`TR.Render(_views[${JSON.stringify(root.target.value)}], TR.ViewRenderArgs(`)
  Tests.expect(code).toContain('<TR.ReactNative.Text>{Value}</TR.ReactNative.Text>')
  Tests.expect(code).toContain('TR.App(_views["RootView"], "test-1")')
  Tests.expect(code).toContain('const Children = _taoChildren;')
})

Tests.test('Kitchen Sink compiles parameter forwarding, capture aliases and nested children', async () => {
  const source = await FileSystem.readFile(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), 'utf8')
  const { tree } = createParser().parse(source)
  const document = transform(tree)
  Tests.expect(document).toBeDefined()
  const code = compile(document!, { revision: 'kitchen-sink' })
  Tests.expect(code).toContain('TR.ViewDefinition("Pair", ["First", "Second"]')
  Tests.expect(code).toContain('TR.ViewRenderArgs([TR.Value(_taoValues, "FirstCaption")], [])')
  Tests.expect(code).toContain('const Caption = TR.Value(_taoValues, "Title") as string;')
  Tests.expect(code).toContain('const Children = _taoChildren;')
  Tests.expect(code).toContain('TR.App(_views["RootView"], "kitchen-sink")')
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
  const { tree } = createParser().parse(source)
  Tests.expect(tree.rootNode.hasError).toBe(false)
  return compile(transform(tree)!, { revision: 'hygiene' })
    .replace(/^import \* as TR from '@runtime';\n/m, '')
    .replace('const _views: Record<string, TR.View> = {};', 'const _views = {};')
    .replace('export default function App()', 'function App()')
}
