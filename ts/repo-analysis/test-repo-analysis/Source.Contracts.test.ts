import { S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { analyzeSourceConformance } from '../repo-analysis-src/Source/source-conformance'
import { readConformanceMessages } from './Source.test-fixtures'

Tests.test('source conformance > retains alias, destructuring, private-doc and multiline-doc diagnostics', async () => {
  await withConformanceWorkspace(async root => {
    await FS.write(Path.join(root, 'ts/api.ts'), InvalidApiSource)
    const diagnostic = await readConformanceMessages(root)
    for (const name of ['readValue', 'first', 'second']) {
      Tests.expect(diagnostic).toContain(`exported API ${name} needs JSDoc beginning with its name and a description`)
    }
    Tests.expect(diagnostic).toContain('private JSDoc is not allowed; use // lines')
    Tests.expect(diagnostic).toContain(
      'multiline JSDoc needs opening-line text, aligned *  continuation lines, and */ after the last text',
    )
    Tests.expect(diagnostic.split('multiline JSDoc needs opening-line text')).toHaveLength(4)
    await FS.write(Path.join(root, 'ts/api.ts'), ValidApiSource)
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
  })
})

Tests.test('source conformance > counts physical body lines and preserves sensitive method bindings', async () => {
  await withConformanceWorkspace(async root => {
    const path = Path.join(root, 'ts/bodies.ts')
    const accepted = createBodyFixture(45)
    await FS.write(path, Shared.joinTextLines(accepted, SensitiveMethodsSource))
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
    const invalidMethod = 'const object = { readValue() { return 1 } }'
    await FS.write(path, Shared.joinTextLines(createBodyFixture(46), invalidMethod))
    const diagnostic = await readConformanceMessages(root)
    Tests.expect(diagnostic.split('function bodies must contain at most 45 physical lines; found 46')).toHaveLength(4)
    Tests.expect(diagnostic).toContain('single-return object functions should use expression-bodied arrow properties')
  })
})

Tests.test('source conformance > checks real comments and restricts native Try to its exact primitive', async () => {
  await withConformanceWorkspace(async root => {
    const path = Path.join(root, 'ts/comments.ts')
    const nativeTry = 'function work() { try { run() } finally { cleanup() } }'
    await FS.write(path, Shared.joinTextLines('/* header */', nativeTry))
    const diagnostic = await readConformanceMessages(root)
    Tests.expect(diagnostic).toContain('use // lines instead of non-JSDoc block comments')
    Tests.expect(diagnostic).toContain('use Try from @shared instead of native try/catch/finally')
    await FS.write(path, CommentSyntaxSource)
    await FS.write(Path.join(root, 'ts/shared/shared-src/universal/TryCatch.ts'), nativeTry)
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
    await FS.write(Path.join(root, 'ts/other/TryCatch.ts'), nativeTry)
    Tests.expect(await readConformanceMessages(root)).toContain(
      'ts/other/TryCatch.ts:1: use Try from @shared instead of native try/catch/finally',
    )
  })
})

async function withConformanceWorkspace(run: (root: string) => Promise<void>): Promise<void> {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'conformance-contracts-'))
  await Try(() => run(root), { finally: () => FS.rm(root, { recursive: true, force: true }) })
}

function createBodyFixture(lines: number): string {
  const bodyLines: string[] = Array.from({ length: lines }, (_, index) => index < 2 ? '' : '  work()')
  bodyLines[0] = '  // Comments and blank lines count toward the physical limit.'
  const body = Shared.joinTextLines(...bodyLines)
  return Shared.joinTextLines(
    'function boundary() {',
    body,
    '}',
    'class Service { run() {',
    body,
    '} }',
    'const readCallback = () => {',
    body,
    '}',
  )
}

const InvalidApiSource = S`
  function readValue() {}
  export { readValue }
  export const { first, nested: { second } } = source
  /** hidden reads private state. */
  function hidden() {}
  /** documented reads input.
   * One space is insufficient. */
  export function documented() {}
  /**
   *  readInput reads input. */
  export function readInput() {}
  /** readOutput reads output.
   *  Closing text must share its line.
   */
  export function readOutput() {}
`

const ValidApiSource = S`
  /** readValue reads a value. */
  function readValue() {}
  export { readValue }
  // hidden reads private state.
  function hidden() {}
  /** documented reads input.
   *  Continuation text stays aligned. */
  export function documented() {}
`

const SensitiveMethodsSource = S`
  const object = {
    readThis() { return this.value },
    readArgument() { return arguments[0] },
    readSuper() { return super.value },
    readExplicitThis(this: object) { return 1 },
    readComputed() { return { [this.value]() {} } },
    readSelf: function self() { return self },
    *readValues() { yield 1 },
  }
`

const CommentSyntaxSource = S`
  const string = '/* text */ try {} catch {} /** text */'
  const template = \`/* head */ \${1} /* tail */ try {} catch {}\`
  const Pattern = /\/\*.*\*\//
`
