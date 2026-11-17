import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { analyzeConstantOrder } from '../repo-analysis-src/Source/source-conformance-constant-order'
import { fixSourceConformance } from '../repo-analysis-src/Source/source-conformance-fix'
import * as ConformanceProgram from '../repo-analysis-src/Source/source-conformance-program'

Tests.test('source constant order > moves inert single-consumer constants before module owners', async () => {
  await withSource(verifySource)
})

async function verifySource(root: string, path: string): Promise<void> {
  const changes = readConstantOrder(root, path)
  Tests.expect([...changes.values()].flat().filter(change => change.newText === '').length).toBe(8)
  const movedDeclarations = [...changes].flatMap(([file, edits]) =>
    edits.filter(change => change.newText === '')
      .map(change => file.text.slice(change.span.start, change.span.start + change.span.length).trim())
  )
  Tests.expect(movedDeclarations).toEqual([
    'const literalValue = 1',
    'const Pattern = /x/',
    "const classValue = 'class'",
    'const callableValue = `callable`',
    "const commandValue = 'command'",
    'const earlierValue = 1',
    "const overloadedValue = 'overloaded'",
    "// Keep the declaration comment.\nconst commentedValue = 'commented'",
  ])
  const original = await FS.readFile(path, 'utf8')
  await fixSourceConformance(root, { excludedFiles: [path] })
  Tests.expect(await FS.readFile(path, 'utf8')).toBe(original)
  await fixSourceConformance(root)
  await verifyFixedSource(root, path, await FS.readFile(path, 'utf8'))
}

async function verifyFixedSource(root: string, path: string, fixed: string): Promise<void> {
  expectFixedOrdering(fixed)
  await fixSourceConformance(root)
  Tests.expect(await FS.readFile(path, 'utf8')).toBe(fixed)
  Tests.expect(readConstantOrder(root, path).size).toBe(0)
}

function readConstantOrder(root: string, path: string): Map<TypeScript.SourceFile, TypeScript.TextChange[]> {
  const paths = [path]
  const program = ConformanceProgram.createConformanceProgram(root, paths)
  const editableSources = ConformanceProgram.getEditableConformanceSources(program, paths)
  return analyzeConstantOrder(program, editableSources)
}

function expectFixedOrdering(fixed: string): void {
  Tests.expect(fixed.indexOf('const literalValue')).toBeLessThan(fixed.indexOf('function readLiteral'))
  Tests.expect(fixed.indexOf('const Pattern')).toBeLessThan(fixed.indexOf('function matchesPattern'))
  Tests.expect(fixed.indexOf('const classValue')).toBeLessThan(fixed.indexOf('class Reader'))
  Tests.expect(fixed.indexOf('const callableValue')).toBeLessThan(fixed.indexOf('const readCallable'))
  Tests.expect(fixed.indexOf('const commandValue')).toBeLessThan(fixed.indexOf('export default registerCommand'))
  Tests.expect(fixed.indexOf('const earlierValue')).toBeGreaterThan(fixed.indexOf('function unrelatedDeclaration'))
  Tests.expect(fixed.indexOf('const earlierValue')).toBeLessThan(fixed.indexOf('function readEarlierValue'))
  Tests.expect(fixed).toContain('(receiver?.run)?.(firstArgument, secondArgument)')
  Tests.expect(fixed.indexOf('const sharedValue')).toBeGreaterThan(fixed.indexOf('function readSharedSecond'))
  Tests.expect(fixed.indexOf('const effectfulValue')).toBeGreaterThan(fixed.indexOf('function readEffectful'))
  Tests.expect(fixed.indexOf('const blockedValue')).toBeGreaterThan(fixed.indexOf("record('barrier')"))
  Tests.expect(fixed.indexOf('const staticValue')).toBeGreaterThan(fixed.indexOf('class StaticReader'))
  Tests.expect(fixed.indexOf('const decoratedValue')).toBeGreaterThan(fixed.indexOf('class DecoratedReader'))
  Tests.expect(fixed.indexOf('const computedValue')).toBeGreaterThan(fixed.indexOf('class ComputedReader'))
  Tests.expect(fixed.indexOf('const overloadedValue'))
    .toBeLessThan(fixed.indexOf('function overloaded(value: string): string'))
  Tests.expect(fixed.indexOf('const commentedValue')).toBeLessThan(fixed.indexOf('function readCommented'))
  Tests.expect(fixed).toContain('// Keep the declaration comment.\nconst commentedValue')
}

type SourceAction = (root: string, path: string) => Promise<void>

async function withSource(run: SourceAction): Promise<void> {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-constant-order-'))
  const path = Path.join(root, 'ts/example.ts')
  await Try(async () => {
    await FS.write(path, source)
    await run(root, path)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
}

const source = S`
  declare function registerCommand(value: unknown): unknown
  declare function record(value: string): void
  type Receiver = { run: (first: string, second: string) => void }
  declare const receiver: Receiver | undefined
  declare const firstArgument: string
  declare const secondArgument: string
  const invoke = (receiver ? receiver.run : undefined)?.(
    firstArgument,
    secondArgument,
  )
  function readLiteral(): number { return literalValue }
  const literalValue = 1
  function matchesPattern(value: string): boolean { return Pattern.test(value) }
  const Pattern = /x/
  class Reader { read(): string { return classValue } }
  const classValue = 'class'
  const readCallable = () => callableValue
  const callableValue = \`callable\`
  export default registerCommand({ action(): string { return commandValue } })
  const commandValue = 'command'
  const earlierValue = 1
  function unrelatedDeclaration(): void {}
  function readEarlierValue(): number { return earlierValue }
  function readSharedFirst(): string { return sharedValue }
  function readSharedSecond(): string { return sharedValue }
  const sharedValue = 'shared'
  function readEffectful(): string { return effectfulValue }
  const effectfulValue = makeValue()
  function readBlocked(): string { return blockedValue }
  record('barrier')
  const blockedValue = 'blocked'
  class StaticReader { static value = staticValue }
  const staticValue = 'static'
  declare function decorate(value: unknown): unknown
  @decorate
  class DecoratedReader { read(): string { return decoratedValue } }
  const decoratedValue = 'decorated'
  class ComputedReader { [getDynamicKey()](): string { return computedValue } }
  const computedValue = 'computed'
  function overloaded(value: string): string
  function overloaded(value: number): number
  function overloaded(value: string | number): string | number { return overloadedValue }
  const overloadedValue = 'overloaded'
  function readCommented(): string { return commentedValue }
  // Keep the declaration comment.
  const commentedValue = 'commented'
  function readExported(): string { return exportedValue }
  export const exportedValue = 'exported'
  function readMultiple(): number { return multipleFirst }
  const multipleFirst = 1, multipleSecond = 2
`
