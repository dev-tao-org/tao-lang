import * as Embedded from '@fix/embedded'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { FormatterResources, FS, Repo } from '@shared/os'
import { loadRuntime } from './IDE.test-utils'

const ExpectedSaveFormatting = Shared.S`
  // Title
  view Ready {
    render Text("Hi 😀")
  }

  view Editing(
`

Tests.test('save formatting uses the WASM snapshot, preserving partial edits and parser ownership', async () => {
  const runtime = await loadRuntime()
  const typescript = Embedded.createTypeScriptFormatter(await FormatterResources.typeScriptFormatterBytes())
  Shared.Try(() => {
    const source = Shared.S`
      // Title
      view Ready{render Text( "Hi 😀" )}

      view Editing(
    `
    const expected = ExpectedSaveFormatting
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

Tests.test('Kitchen Sink parses with Tao and embedded TSX syntax captures', async () => {
  const runtime = await loadRuntime()
  Shared.Try(() => {
    const source = FS.readFileSync(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), 'utf8')
    const result = runtime.document.update(source)
    Tests.expect(result.diagnostics).toEqual([])
    Tests.expect(
      result.tokens.some(token => token.kind === 'keyword' && Shared.Source.slice(source, token) === 'app'),
    ).toBe(true)
    Tests.expect(
      result.tokens.some(token => token.kind === 'property' && Shared.Source.slice(source, token) === 'padding'),
    )
      .toBe(true)
    Tests.expect(
      result.tokens.some(token => token.kind === 'keyword' && Shared.Source.slice(source, token) === 'return'),
    )
      .toBe(true)
  }, { finally: runtime.dispose })
})

Tests.test('requirements and import source markers receive keyword highlights', async () => {
  const runtime = await loadRuntime()
  Shared.Try(() => {
    const source = Shared.S`
      requires npm:date-fns version 4.1.0 as DateFns
      use tao@ui Text
    `
    const result = runtime.document.update(source)
    Tests.expect(result.diagnostics).toEqual([])
    for (const keyword of ['requires', 'version', 'as', 'use']) {
      const start = source.indexOf(keyword)
      Tests.expect(
        result.tokens.some(token =>
          token.kind === 'keyword' && token.range.start === start
          && Shared.Source.slice(source, token) === keyword
        ),
      ).toBe(true)
    }
  }, { finally: runtime.dispose })
})

Tests.test('TypeScript library declarations highlight their keyword, name and published members', async () => {
  const runtime = await loadRuntime()
  Shared.Try(() => {
    const source = Shared.S`
      ts-library Demo {
        publish { Greeting, Cards, }
      }
    `
    const result = runtime.document.update(source)
    Tests.expect(result.diagnostics).toEqual([])
    const tokens = result.tokens.map(token => ({ kind: token.kind, text: Shared.Source.slice(source, token) }))
    Tests.expect(tokens).toEqual([
      { kind: 'keyword', text: 'ts-library' },
      { kind: 'type', text: 'Demo' },
      { kind: 'keyword', text: 'publish' },
      { kind: 'type', text: 'Greeting' },
      { kind: 'type', text: 'Cards' },
    ])
  }, { finally: runtime.dispose })
})

Tests.test('incremental malformed edits recover without affecting another open document', async () => {
  const runtime = await loadRuntime()
  Shared.Try(() => {
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
  Shared.Try(() => {
    const source = Shared.S`
      app Demo { root Main }
      view Main { render inject \`\`\`ts const emoji = "😀"; const title = <Thing /> \`\`\` }
    `
    const result = runtime.document.update(source)
    Tests.expect(result.diagnostics).toEqual([])
    const titleStart = source.indexOf('title')
    Tests.expect(result.tokens.some(token => token.kind === 'variable' && token.range.start === titleStart)).toBe(true)
    Tests.expect(runtime.document.update(source.replace('<Thing />', '<Thing>')).diagnostics.length).toBeGreaterThan(0)
    Tests.expect(runtime.document.update(source.replace('😀', '😁')).diagnostics).toEqual([])
  }, { finally: runtime.dispose })
})

Tests.test('editor shows the misplaced statement range alongside embedded syntax diagnostics', async () => {
  const runtime = await loadRuntime()
  Shared.Try(() => {
    const misplaced = 'root Other'
    const source = Shared.S`
      // 😀
      view main { root Other render inject \`\`\`ts return <Broken> \`\`\` }
    `
    const result = runtime.document.update(source)
    const start = source.indexOf(misplaced)
    const placement = {
      range: Shared.Range(start, start + misplaced.length),
      message: 'Root declarations belong directly inside an app.',
    }
    Tests.expect(result.diagnostics).toContainEqual(placement)
    const nameStart = source.indexOf('main')
    Tests.expect(result.diagnostics).toContainEqual({
      range: Shared.Range(nameStart, nameStart + 'main'.length),
      message: "Declared name 'main' must start with an uppercase letter.",
    })
    const corrected = source.replace('view main', 'view Main').replace(misplaced, '').replace('<Broken>', '<Broken />')
    Tests.expect(result.diagnostics.some(diagnostic => diagnostic.range.start > placement.range.end)).toBe(true)
    Tests.expect(runtime.document.update(corrected).diagnostics).toEqual([])
  }, { finally: runtime.dispose })
})
