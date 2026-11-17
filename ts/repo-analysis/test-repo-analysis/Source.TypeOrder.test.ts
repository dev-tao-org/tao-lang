import { S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { fixSourceConformance } from '../repo-analysis-src/Source/source-conformance-fix'
import * as ConformanceProgram from '../repo-analysis-src/Source/source-conformance-program'
import { analyzeSignatureTypeOrder } from '../repo-analysis-src/Source/source-conformance-type-order'

Tests.test('source type order > moves owned contracts before functions while preserving runtime order and comments', async () => {
  await withSources(async (root, paths) => {
    const changes = readTypeOrder(root, paths)
    Tests.expect([...changes.values()].flat().filter(change => change.newText === '').length).toBe(6)
    await fixSourceConformance(root)
    const fixed = await FS.readFile(paths[0]!, 'utf8')
    Tests.expect(fixed).toContain('// Owned request contract.\ntype Request = { value: string }')
    Tests.expect(fixed.indexOf('type Request')).toBeLessThan(fixed.indexOf('/** execute reads the request. */'))
    Tests.expect(fixed.indexOf('interface Reply')).toBeLessThan(fixed.indexOf('function convert'))
    Tests.expect(fixed.indexOf('type CommandOptions')).toBeLessThan(fixed.indexOf('export default registerCommand'))
    Tests.expect(fixed.indexOf('type Recursive')).toBeLessThan(fixed.indexOf('const recurse'))
    Tests.expect(fixed.indexOf('type Shared')).toBeGreaterThan(fixed.indexOf('function second'))
    Tests.expect(fixed.indexOf('type Public')).toBeGreaterThan(fixed.indexOf('function readPublic'))
    Tests.expect(fixed.indexOf('interface Merged')).toBeGreaterThan(fixed.indexOf('function readMerged'))
    Tests.expect(fixed.indexOf('type Directed')).toBeGreaterThan(fixed.indexOf('function readDirected'))
    Tests.expect(fixed.indexOf('type ClassOptions')).toBeGreaterThan(fixed.indexOf('class Reader'))
    Tests.expect(fixed.indexOf('type Already')).toBeLessThan(fixed.indexOf('function already'))
    Tests.expect(fixed.indexOf('type Left')).toBeLessThan(fixed.indexOf('interface Right'))
    Tests.expect(fixed.indexOf('interface Right')).toBeLessThan(fixed.indexOf('function combine'))
    Tests.expect(fixed.indexOf('type BodyOnly')).toBeGreaterThan(fixed.indexOf('function bodyOnly'))
    Tests.expect(fixed.indexOf('type CycleLeft')).toBeGreaterThan(fixed.indexOf('function cycle'))
    Tests.expect(fixed.match(RuntimeRecordCalls)).toEqual(["record('first')", "record('second')", "record('gap')"])
    Tests.expect(fixed).toContain('/** execute reads the request. */\nfunction execute')
    Tests.expect(fixed).toContain('function convert(value: Reply): Reply;\nfunction convert(value: Reply)')
    Tests.expect(await FS.readFile(paths[2]!, 'utf8')).toBe(generated)
    await fixSourceConformance(root)
    Tests.expect(await FS.readFile(paths[0]!, 'utf8')).toBe(fixed)
    Tests.expect(readTypeOrder(root, paths).size).toBe(0)
  })
})

function readTypeOrder(root: string, paths: string[]): Map<TypeScript.SourceFile, TypeScript.TextChange[]> {
  const program = ConformanceProgram.createConformanceProgram(root, paths)
  const editableSources = ConformanceProgram.getEditableConformanceSources(program, paths)
  return analyzeSignatureTypeOrder(program, editableSources)
}

type SourceFixtureAction = (root: string, paths: string[]) => Promise<void>

async function withSources(run: SourceFixtureAction): Promise<void> {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-type-order-'))
  await Try(async () => {
    const paths = ['example.ts', 'consumer.d.ts', 'generated.ts'].map(name => Path.join(root, 'ts', name))
    await FS.write(paths[0]!, source)
    await FS.write(
      paths[1]!,
      Shared.joinTextLines(
        S`
          import type { Public as Renamed } from './example'
          export type Consumer = Renamed
        `,
        '',
      ),
    )
    await FS.write(paths[2]!, generated)
    await run(root, paths)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
}

const generated = Shared.joinTextLines(
  S`
    // @generated
    function read(value: Generated): void {}
    type Generated = string
  `,
  '',
)
const RuntimeRecordCalls = /record\('[^']+'\)/g
const source = S`
  declare function record(value: string): void
  declare function registerCommand(value: unknown): unknown
  record('first')
  /** execute reads the request. */
  function execute(value: Request): Request { const copy: Request = value; const read = (): Request => copy; return read() }
  // Owned request contract.
  type Request = { value: string }
  function convert(value: Reply): Reply;
  function convert(value: Reply): Reply { return value }
  interface Reply { value: string }
  record('second')
  export default registerCommand({ action(options: CommandOptions): void {} })
  type CommandOptions = { quiet: boolean }
  const recurse = (value: Recursive): Recursive => value
  type Recursive = { child?: Recursive }
  function first(value: Shared): void {}
  function second(value: Shared): void {}
  type Shared = string
  function readPublic(value: Public): void {}
  export type Public = string
  function readMerged(value: Merged): void {}
  interface Merged { first: string }
  interface Merged { second: string }
  function readDirected(value: Directed): void {}
  // @ts-ignore retained with this declaration
  type Directed = string
  class Reader { read(value: ClassOptions): void {} }
  type ClassOptions = string
  type Already = string
  record('gap')
  function already(value: Already): void {}
  function aliasConsumer(value: Indirect): void {}
  type Indirect = string
  type AnotherConsumer = Indirect
  function shadowed(value: string): void { type Request = number; const count: Request = 1 }
  function combine(left: Left, right: Right): void {}
  type Left = string
  interface Right { value: string }
  function bodyOnly(): void { const value: BodyOnly = 'hello' }
  type BodyOnly = string
  function cycle(left: CycleLeft, right: CycleRight): void {}
  type CycleLeft = { right?: CycleRight }
  type CycleRight = { left?: CycleLeft }
` + '\n'
