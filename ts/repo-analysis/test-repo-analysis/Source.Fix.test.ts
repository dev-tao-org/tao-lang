import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { fixSourceConformance } from '../repo-analysis-src/Source/source-conformance-fix'
import { unnamedUnionIssue } from '../repo-analysis-src/Source/source-conformance-naming'

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
