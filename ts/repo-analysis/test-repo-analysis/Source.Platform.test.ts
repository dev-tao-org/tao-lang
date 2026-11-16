import * as Tests from '@shared-tests'

import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { platformGlobalIssue } from '../repo-analysis-src/Source/source-bridge-globals'
import { createFixtureProgram } from './Source.test-fixtures'

Tests.test('platform conformance > restricts raw globals to platform bridge owners', () => {
  Tests.expect(findPlatformIssue('process.cwd()', 'ts/app.ts')).toBe(
    'platform global "process" belongs in ts/shared/shared-src/os/Process/Process-Current.ts',
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
  for (
    const source of [
      'Date["now"]()',
      'new Date',
      'new globalThis.Date()',
      'globalThis.Date.now()',
      'globalThis["Date"]["now"]()',
    ]
  ) {
    Tests.expect(findPlatformIssue(source, 'ts/app.ts')).toBe(
      'platform global "Date" belongs in ts/shared/shared-src/universal/Time.ts',
    )
    Tests.expect(findPlatformIssue(source, 'ts/shared/shared-src/universal/Time.ts')).toBeUndefined()
  }
  Tests.expect(findPlatformIssue('new Date(0)', 'ts/app.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('new globalThis.Date(0)', 'ts/app.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('new globalThis["Date"](0)', 'ts/app.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('record.process()', 'ts/app.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('type T = TypeScript.Node', 'ts/app.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('import { Buffer as NodeBuffer } from "./bridge"', 'ts/app.ts')).toBeUndefined()
})

Tests.test('platform conformance > follows shorthand values and respects shadowed globalThis bindings', () => {
  const filename = '/fixture/consumer.ts'
  const globals = '/fixture/globals.d.ts'
  const sources = new Map([
    [
      filename,
      'const host = { process }; function read(globalThis: { process: string }) { return globalThis.process }',
    ],
    [globals, 'declare const process: { cwd(): string }'],
  ])
  const program = createFixtureProgram(sources)
  const checker = program.getTypeChecker()
  const issues: Array<{ source: string; issue: string }> = []
  const visit = (node: TypeScript.Node): void => {
    const issue = platformGlobalIssue(node, 'ts/consumer.ts', checker)
    if (issue) {
      issues.push({ source: node.getText(), issue })
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(program.getSourceFile(filename)!)
  Tests.expect(issues).toEqual([
    {
      source: 'process',
      issue: 'platform global "process" belongs in ts/shared/shared-src/os/Process/Process-Current.ts',
    },
  ])
})

Tests.test('platform conformance > permits globals only inside serialized browser callbacks', () => {
  const source = 'declare const page: Page; page.evaluate(() => new URL("/")); new URL("/")'
  const filename = '/fixture/consumer.ts'
  const browserTypes = '/fixture/node_modules/playwright-core/types/types.d.ts'
  const sources = new Map([
    [filename, source],
    [browserTypes, 'interface Page { evaluate(callback: () => unknown): void }'],
  ])
  const program = createFixtureProgram(sources)
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

type PlatformIssue = string | undefined

Tests.test('platform conformance > centralizes process environment access even inside the OS package', () => {
  const message = 'process environment access belongs in Env; use readonly values or subprocess addEnv overrides'
  for (const source of ['process.env.HOME', 'process["env"]["HOME"]', 'globalThis.process.env.HOME']) {
    Tests.expect(findPlatformIssue(source, 'ts/shared/shared-src/os/Other.ts')).toBe(message)
    Tests.expect(findPlatformIssue(source, 'ts/shared/shared-src/os/Env.ts')).toBeUndefined()
  }
  Tests.expect(findPlatformIssue('Env.get("HOME")', 'ts/shared/shared-src/os/Other.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('const text = "process.env.HOME"', 'ts/shared/shared-src/os/Other.ts'))
    .toBeUndefined()
})

function findPlatformIssue(source: string, filename: string): string | undefined {
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  let issue: PlatformIssue
  const visit = (node: TypeScript.Node): void => {
    issue ??= platformGlobalIssue(node, filename)
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issue
}
