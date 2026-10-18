import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { FileSystem, Repo, Tests } from '@shared/os'
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

Tests.test('Kitchen Sink compiles parameter forwarding, capture aliases and nested children', async () => {
  const source = await FileSystem.readFile(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), 'utf8')
  const { tree } = createParser().parse(source)
  const document = transform(tree)
  Tests.expect(document).toBeDefined()
  const code = compile(document!, { revision: 'kitchen-sink' })
  Tests.expect(code).toContain('TR.ViewDefinition("Pair", ["First", "Second"]')
  Tests.expect(code).toContain('TR.ViewRenderArgs([_values["First"]], [])')
  Tests.expect(code).toContain('const Caption = _values["Title"] as string;')
  Tests.expect(code).toContain('const Children = _children;')
  Tests.expect(code).toContain('TR.App(_views["RootView"], "kitchen-sink")')
})
