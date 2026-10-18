import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Tests } from '@shared/os'
import { compile } from '../compile-src/Compile'

Tests.test('Hello World generates generic runtime calls and authored native injections', async () => {
  const { tree } = createParser().parse(await Tests.readApp('Hello World'))
  const code = compile(transform(tree)!, { revision: 'test-1' })
  Tests.expect(code).toContain('TR.ViewDefinition("Text", ["Value"]')
  Tests.expect(code).toContain('TR.Render(_views["Col"], TR.ViewRenderArgs(')
  Tests.expect(code).toContain('<TR.ReactNative.Text>{Value}</TR.ReactNative.Text>')
  Tests.expect(code).toContain('TR.App(_views["RootView"], "test-1")')
  Tests.expect(code).toContain('const Children = _children;')
})
