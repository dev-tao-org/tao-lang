import * as AST from '@ast-gen/AST'
import { Errors, Switch, Time, Try } from '@shared'

/** TestDriver runs one isolated app journey against a platform's visible UI. */
export type TestDriver = {
  run(app: string): Promise<void>
  press(tag: string): Promise<void>
  type(tag: string, value: string): Promise<void>
  expectText(value: string, tag?: string): Promise<void>
  expectInput(tag: string, value: string): Promise<void>
  dispose(): Promise<void>
}

/** TestOptions supplies immutable source identity and a fresh platform session for each case. */
export type TestOptions = {
  path: string
  source: string
  onProgress?: TestProgress
  createDriver(): Promise<TestDriver>
}

/** TestProgress reports optional checkpoints during an app test run. */
export type TestProgress = (message: string) => void

/** TestResult reports one journey and the source location of its outcome. */
export type TestResult = {
  label: string
  status: 'passed' | 'failed'
  line: number
  durationMs: number
  error?: string
}

/** runTests executes the app journeys declared in one semantic source document. */
export async function runTests(document: AST.Document, options: TestOptions): Promise<TestResult[]> {
  const results: TestResult[] = []
  for (const suite of document.root.declarations.filter(AST.IsTestsDeclaration)) {
    for (const test of suite.tests) {
      const label = caseLabel(suite, test, options)
      options.onProgress?.(`Test ${label}…`)
      results.push(await runCase(suite, test, options))
    }
  }
  if (results.length === 0) {
    Errors.ThrowUserInput(`No Tao test cases found in ${options.path}.`)
  }
  return results
}

async function runCase(
  suite: AST.TestsDeclaration,
  test: AST.TestDeclaration,
  options: TestOptions,
): Promise<TestResult> {
  const startedAt = Time.nowMs()
  const label = caseLabel(suite, test, options)
  let current: AST.TestStep | AST.TestDeclaration = test
  let driver: TestDriver | undefined
  return await Try(async (): Promise<TestResult> => {
    assertJourney(test)
    driver = await options.createDriver()
    for (const step of test.steps) {
      current = step
      await runStep(step, driver)
    }
    return { label, status: 'passed', line: lineOf(test, options.source), durationMs: Time.nowMs() - startedAt }
  }, {
    catch: (error): TestResult => ({
      label,
      status: 'failed',
      line: lineOf(current, options.source),
      durationMs: Time.nowMs() - startedAt,
      error: String(error),
    }),
    async finally() {
      await driver?.dispose()
    },
  })
}

function assertJourney(test: AST.TestDeclaration): void {
  const first = test.steps[0]
  if (!first || !AST.IsKind(first, 'RunStatement')) {
    Errors.ThrowUserInput('An app test must start with run <app>.')
  }
  if (test.steps.slice(1).some(step => AST.IsKind(step, 'RunStatement'))) {
    Errors.ThrowUserInput('Use a separate test case for another app launch.')
  }
  if (!test.steps.some(step => AST.IsKind(step, 'ExpectStatement') && step.expectations.length > 0)) {
    Errors.ThrowUserInput('An app test must contain a visible expectation.')
  }
}

function runStep(step: AST.TestStep, driver: TestDriver): Promise<void> {
  return Switch.kind(step, {
    RunStatement: value => driver.run(value.app.value),
    PressStatement: value => driver.press(value.target.value),
    TypeStatement: value => driver.type(value.target.value, value.value.value),
    async ExpectStatement(value) {
      for (const expectation of value.expectations) {
        await expectValue(expectation, value.target?.value, driver)
      }
    },
  })
}

function expectValue(expectation: AST.Expectation, parentTag: string | undefined, driver: TestDriver): Promise<void> {
  return Switch.kind(expectation, {
    TextExpectation: value => driver.expectText(value.value.value, parentTag),
    InputExpectation: value =>
      driver.expectInput(
        value.target?.value ?? parentTag ?? Errors.ThrowUserInput('An input expectation needs a render tag.'),
        value.value.value,
      ),
  })
}

function caseLabel(suite: AST.TestsDeclaration, test: AST.TestDeclaration, options: TestOptions): string {
  return [suite.label?.value, test.label?.value ?? `${options.path}:${lineOf(test, options.source)}`]
    .filter(Boolean).join(' / ')
}

function lineOf(node: AST.Node, source: string): number {
  return source.slice(0, node.start).split('\n').length
}
