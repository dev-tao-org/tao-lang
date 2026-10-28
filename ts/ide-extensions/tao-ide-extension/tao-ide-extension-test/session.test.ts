import { createTypeScriptFormatter } from '@fix/lib/formatter/Embedded'
import { Source, Try } from '@shared'
import { FileSystem, FormatterResources, Path, Repo, Tests } from '@shared/os'
import { createWasmDocumentSession } from '../tao-ide-extension-src/core'

Tests.test('save formatting uses the WASM snapshot, preserving partial edits and parser ownership', async () => {
  const runtime = await loadRuntime()
  const typescript = createTypeScriptFormatter(await FormatterResources.typeScriptFormatterBytes())
  Try(() => {
    const source = '// Title\nview Ready{render Text( "Hi 😀" )}\n\nview Editing('
    const expected = '// Title\nview Ready {\n  render Text("Hi 😀")\n}\n\nview Editing('
    runtime.document.update(source)
    const result = runtime.document.format()
    Tests.expect(result.text).toBe(expected)
    Tests.expect(result.skipped.length).toBeGreaterThan(0)
    Tests.expect(runtime.document.format().text).toBe(expected)
    runtime.document.update(result.text)
    Tests.expect(runtime.document.format().edits).toEqual([])
    runtime.document.update('view Native{render inject ```ts const n=1;return <Text value={ n } /> ```}')
    Tests.expect(runtime.document.format({ typescript }).text).toBe(
      'view Native {\n  render inject ```ts\n    const n = 1\n    return <Text value={n} />\n  ```\n}',
    )
  }, { finally: runtime.dispose })
})

const packageRoot = Repo.resolvePath('.artifacts/ide-extension/package')

Tests.test('Kitchen Sink parses with Tao and embedded TSX syntax captures', async () => {
  const runtime = await loadRuntime()
  Try(() => {
    const source = FileSystem.readFileSync(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), 'utf8')
    const result = runtime.document.update(source)
    Tests.expect(result.diagnostics).toEqual([])
    Tests.expect(
      result.tokens.some(token => token.kind === 'keyword' && Source.slice(source, token) === 'app'),
    ).toBe(true)
    Tests.expect(
      result.tokens.some(token => token.kind === 'property' && Source.slice(source, token) === 'padding'),
    )
      .toBe(true)
    Tests.expect(
      result.tokens.some(token => token.kind === 'keyword' && Source.slice(source, token) === 'return'),
    )
      .toBe(true)
  }, { finally: runtime.dispose })
})

Tests.test('requirements and import source markers receive keyword highlights', async () => {
  const runtime = await loadRuntime()
  Try(() => {
    const source = 'requires npm:date-fns version 4.1.0 as dateFns\nuse Text from tao@ui'
    const result = runtime.document.update(source)
    Tests.expect(result.diagnostics).toEqual([])
    for (const keyword of ['requires', 'version', 'as', 'from']) {
      const start = source.indexOf(keyword)
      Tests.expect(
        result.tokens.some(token =>
          token.kind === 'keyword' && token.range.start === start
          && Source.slice(source, token) === keyword
        ),
      ).toBe(true)
    }
  }, { finally: runtime.dispose })
})

Tests.test('incremental malformed edits recover without affecting another open document', async () => {
  const runtime = await loadRuntime()
  Try(() => {
    const other = runtime.createDocument()
    const valid = 'view RootView { render Text("Hello") }'
    Tests.expect(runtime.document.update(valid).diagnostics).toEqual([])
    const broken = 'view RootView { render Col { Text("Hello")'
    Tests.expect(runtime.document.update(broken).diagnostics.length).toBeGreaterThan(0)
    Tests.expect(other.update('view Other { render Text("Other") }').diagnostics).toEqual([])
    const repaired = 'view RootView { render Col { Text("Hello") } }'
    Tests.expect(runtime.document.update(repaired).diagnostics).toEqual([])
    runtime.document.dispose()
    Tests.expect(other.update('view Other { render Text("Changed") }').diagnostics).toEqual([])
  }, { finally: runtime.dispose })
})

Tests.test('embedded TSX captures map through Unicode prefixes into editor UTF-16 offsets', async () => {
  const runtime = await loadRuntime()
  Try(() => {
    const source =
      'app Demo { root Main }\nview Main { render inject ```ts const emoji = "😀"; const title = <Thing /> ``` }'
    const result = runtime.document.update(source)
    Tests.expect(result.diagnostics).toEqual([])
    const titleStart = source.indexOf('title')
    Tests.expect(result.tokens.some(token => token.kind === 'variable' && token.range.start === titleStart)).toBe(true)
    Tests.expect(runtime.document.update(source.replace('<Thing />', '<Thing>')).diagnostics.length).toBeGreaterThan(0)
    Tests.expect(runtime.document.update(source.replace('😀', '😁')).diagnostics).toEqual([])
  }, { finally: runtime.dispose })
})

async function loadRuntime() {
  const readBytes = (path: string) => FileSystem.readFile(Path.join(packageRoot, path))
  const [taoGrammar, tsxGrammar, taoQuery, tsxQuery] = await Promise.all([
    readBytes('grammars/tree-sitter-tao.wasm'),
    readBytes('grammars/tree-sitter-tsx.wasm'),
    FileSystem.readFile(Path.join(packageRoot, 'queries/tao-highlights.scm'), 'utf8'),
    FileSystem.readFile(Path.join(packageRoot, 'queries/tsx-highlights.scm'), 'utf8'),
  ])
  return createWasmDocumentSession(
    { taoGrammar, tsxGrammar, taoQuery, tsxQuery },
    undefined,
    Path.join(packageRoot, 'runtime/web-tree-sitter.wasm'),
  )
}
