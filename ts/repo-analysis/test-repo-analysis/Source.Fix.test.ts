import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { analyzeConstantOrder } from '../repo-analysis-src/Source/source-conformance-constant-order'
import { fixSourceConformance } from '../repo-analysis-src/Source/source-conformance-fix'
import { unnamedUnionIssue } from '../repo-analysis-src/Source/source-conformance-naming'
import * as ConformanceProgram from '../repo-analysis-src/Source/source-conformance-program'
import { analyzeSignatureTypeOrder } from '../repo-analysis-src/Source/source-conformance-type-order'

Tests.test('source fixing > fixes unasserted optional reads and leaves casts for named absence aliases', async () => {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-source-fix-'))
  await Try(async () => {
    const path = Path.join(root, 'ts/example.ts')
    await FS.write(
      path,
      declarations + S`
        node ? node.text as 'label' : undefined
        node ? (node.text as 'label') : undefined
        node ? node[(key ? key.text : undefined) ?? 'text'] : undefined
        scalar ? scalar.length : undefined
        node ? /* keep this explanation */ node.text : undefined
      `,
    )
    const expected = declarations + S`
      node ? node.text as 'label' : undefined
      node ? (node.text as 'label') : undefined
      node?.[(key?.text) ?? 'text']
      scalar ? scalar.length : undefined
      node ? /* keep this explanation */ node.text : undefined
    `
    await fixSourceConformance(root)
    Tests.expect(await FS.readFile(path, 'utf8')).toBe(expected)
    Tests.expect(unnamedUnions(expected)).toEqual([])
    await fixSourceConformance(root)
    Tests.expect(await FS.readFile(path, 'utf8')).toBe(expected)
    const legacy = Path.join(root, '.x-tao-old-v1/ignored.ts')
    await FS.write(legacy, 'node ? node.text : undefined')
    await fixSourceConformance(root)
    Tests.expect(await FS.readFile(legacy, 'utf8')).toBe('node ? node.text : undefined')
  }, {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

const authoredDiscoverySource = S`
  import './.staging/consumer'
  function readShared(value: Shared): Shared { return value }
  export type Shared = string
  function readLocal(value: Local): string { return value + localSuffix }
  type Local = string
  const localSuffix = '!'
`
const hiddenDiscoverySource = S`
  import type { Shared } from '../example'
  const shared: Shared = 'hidden'
  function readHidden(value: Hidden): string { return value + hiddenSuffix }
  type Hidden = string
  const hiddenSuffix = '!'
`

Tests.test('source fixing > skips hidden sources while respecting their references', async () => {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-source-scope-'))
  await Try(async () => {
    const hiddenRoot = Path.join(root, 'ts/.staging')
    const hiddenSource = Path.join(hiddenRoot, 'consumer.ts')
    const hiddenFile = Path.join(root, 'ts/.notes.ts')
    const authored = Path.join(root, 'ts/example.ts')
    await FS.write(authored, authoredDiscoverySource)
    await FS.write(hiddenSource, hiddenDiscoverySource)
    await FS.write(hiddenFile, 'export {}')
    const sources = await ConformanceProgram.conformanceSources(root)
    Tests.expect(sources).toEqual([authored])
    Tests.expect(await FS.listSourceFiles(hiddenRoot)).toEqual([hiddenSource])
    const program = ConformanceProgram.createConformanceProgram(root, sources)
    Tests.expect(program.getSourceFile(hiddenSource)?.fileName).toBe(hiddenSource)
    const editableSources = ConformanceProgram.getEditableConformanceSources(program, sources)
    const typeChanges = analyzeSignatureTypeOrder(program, editableSources)
    const constantChanges = analyzeConstantOrder(program, editableSources)
    Tests.expect([...typeChanges.keys()].map(file => file.fileName)).toEqual([authored])
    Tests.expect([...constantChanges.keys()].map(file => file.fileName)).toEqual([authored])
    await fixSourceConformance(root)
    const fixed = await FS.readFile(authored, 'utf8')
    Tests.expect(fixed).toContain('type Local = string')
    Tests.expect(fixed).toContain("const localSuffix = '!'")
    Tests.expect(fixed.indexOf('export type Shared')).toBeGreaterThan(fixed.indexOf('function readShared'))
    Tests.expect(fixed.indexOf('type Local')).toBeLessThan(fixed.indexOf('function readLocal'))
    Tests.expect(fixed.indexOf('const localSuffix')).toBeLessThan(fixed.indexOf('function readLocal'))
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

const declarations = S`
  type OptionalNode = { text: string } | null
  type OptionalKey = { text: 'text' } | undefined
  type OptionalScalar = string | undefined
  declare const node: OptionalNode
  declare const key: OptionalKey
  declare const scalar: OptionalScalar
` + '\n'

function unnamedUnions(source: string): string[] {
  const file = TypeScript.createSourceFile('/fixed.ts', source, TypeScript.ScriptTarget.Latest, true)
  const issues: string[] = []
  const visit = (node: TypeScript.Node): void => {
    const issue = unnamedUnionIssue(node)
    if (issue) {
      issues.push(issue)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}
