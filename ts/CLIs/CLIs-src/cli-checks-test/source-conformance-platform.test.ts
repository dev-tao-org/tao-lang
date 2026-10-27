import { Tests } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { platformGlobalIssue } from '../cli-checks/source-bridge-globals'

Tests.test('platform conformance > restricts raw globals to platform bridge owners', () => {
  Tests.expect(findPlatformIssue('process.cwd()', 'ts/app.ts')).toBe(
    'platform global "process" belongs in ts/shared/shared-src/os/bridges/Bridge_node/Bridge_node.ts',
  )
  Tests.expect(findPlatformIssue('Bun.version', 'ts/shared/shared-src/os/bridges/Bridge_node/Bridge_node.ts')).toBe(
    'platform global "Bun" belongs in ts/shared/shared-src/os/bridges/Bridge_bun/Bridge_bun.ts',
  )
  Tests.expect(findPlatformIssue('fetch("/")', 'ts/shared/shared-src/os/bridges/Bridge_browser/Bridge_browser.ts'))
    .toBeUndefined()
  Tests.expect(findPlatformIssue('Date.now()', 'ts/shared/shared-src/universal/Time.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('new Date()', 'ts/shared/shared-src/universal/Time.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('Date()', 'ts/shared/shared-src/universal/Time.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('queueMicrotask(() => {})', 'ts/shared/shared-src/universal/Time.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('Date.now()', 'ts/app.ts')).toBe(
    'platform global "Date" belongs in ts/shared/shared-src/universal/Time.ts',
  )
  Tests.expect(findPlatformIssue('record.process()', 'ts/app.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('type T = TypeScript.Node', 'ts/app.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('import { Buffer as NodeBuffer } from "./bridge"', 'ts/app.ts')).toBeUndefined()
})

Tests.test('platform conformance > permits globals only inside serialized browser callbacks', () => {
  const source = 'declare const page: Page; page.evaluate(() => new URL("/")); new URL("/")'
  const filename = '/fixture/consumer.ts'
  const browserTypes = '/fixture/node_modules/playwright-core/types/types.d.ts'
  const sources = new Map([
    [filename, source],
    [browserTypes, 'interface Page { evaluate(callback: () => unknown): void }'],
  ])
  const host = TypeScript.createCompilerHost({ noLib: true })
  host.getSourceFile = path => {
    const text = sources.get(path)
    return text === undefined
      ? undefined
      : TypeScript.createSourceFile(path, text, TypeScript.ScriptTarget.Latest, true)
  }
  const program = TypeScript.createProgram([...sources.keys()], { noLib: true }, host)
  const checker = program.getTypeChecker()
  const file = program.getSourceFile(filename)!
  const issues: string[] = []
  const visit = (node: TypeScript.Node): void => {
    const issue = platformGlobalIssue(node, 'ts/consumer.ts', checker)
    if (issue) {
      issues.push(issue)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  Tests.expect(issues).toEqual([
    'platform global "URL" belongs in ts/shared/shared-src/os/bridges/Bridge_browser/Bridge_browser.ts',
  ])
})

function findPlatformIssue(source: string, filename: string): string | undefined {
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  let issue: string | undefined
  const visit = (node: TypeScript.Node): void => {
    issue ??= platformGlobalIssue(node, filename)
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issue
}
