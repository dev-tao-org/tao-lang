import * as AST from '@ast-gen'
import { Errors, Source, Switch, Time, Try, UserInput } from '@shared'
import * as SourceValidation from '@source-validation'

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
  signal?: AbortSignal
  createDriver(): Promise<TestDriver>
}

/** TestProgress reports optional checkpoints during an app test run. */
export type TestProgress = (message: string) => void

/** TestResult reports one journey and the source location of its outcome. */
export type TestResult = {
  label: string
  status: TestStatus
  line: number
  durationMs: number
  error?: string
}

/** runTests executes the app journeys declared in one semantic source document. */
export async function runTests(document: AST.Document, options: TestOptions): Promise<TestResult[]> {
  SourceValidation.assertValidStatements(document, options.path)
  const results: TestResult[] = []
  for (const suite of AST.GetTestsDeclarations(document)) {
    for (const test of AST.GetTests(suite)) {
      const label = caseLabel(suite, test, options)
      options.onProgress?.(`Test ${label}…`)
      results.push(await runCase(suite, test, options))
      if (options.signal?.aborted) {
        return results
      }
    }
  }
  if (results.length === 0) {
    UserInput.Fail(`No Tao test cases found in ${options.path}.`)
  }
  return results
}

type TestStatus = 'passed' | 'failed'
type CurrentTestStep = AST.TestStep | AST.TestDeclaration
type OptionalTestDriver = TestDriver | undefined
type OptionalRenderTag = string | undefined

async function runCase(
  suite: AST.TestsDeclaration,
  test: AST.TestDeclaration,
  options: TestOptions,
): Promise<TestResult> {
  const startedAt = Time.nowMs()
  const label = caseLabel(suite, test, options)
  let current: CurrentTestStep = test
  let driver: OptionalTestDriver
  return await Try(async (): Promise<TestResult> => {
    assertJourney(test)
    assertActive(options.signal)
    driver = await options.createDriver()
    for (const step of AST.GetTestSteps(test)) {
      assertActive(options.signal)
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

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    Errors.ThrowHostEnvironment('Tao test run interrupted.')
  }
}

function assertJourney(test: AST.TestDeclaration): void {
  const steps = AST.GetTestSteps(test)
  const first = steps[0]
  UserInput.Require(!(!first || !AST.IsKind(first, 'RunStatement')), 'An app test must start with run <app>.')
  UserInput.Require(
    !steps.slice(1).some(step => AST.IsKind(step, 'RunStatement')),
    'Use a separate test case for another app launch.',
  )
  UserInput.Require(
    !!steps.some(step => AST.IsKind(step, 'ExpectStatement') && hasExpectations(step)),
    'An app test must contain a visible expectation.',
  )
}

function runStep(step: AST.TestStep, driver: TestDriver): Promise<void> {
  return Switch.kind(step, {
    RunStatement: value => driver.run(value.app.value),
    PressStatement: value => driver.press(value.target.value),
    TypeStatement: value => driver.type(value.target.value, value.value.value),
    ExpectStatement: value => runExpectStatement(value, driver),
  })
}

// Expand Tao expect syntax before calling the platform driver.
// Inline and block forms share an optional parent tag. TestDriver keeps only expectText and
// expectInput so browser implementations stay free of AST shapes.
async function runExpectStatement(statement: AST.ExpectStatement, driver: TestDriver): Promise<void> {
  if (statement.expectation) {
    await expectValue(statement.expectation, statement.target?.value, driver)
  } else if (statement.block) {
    for (const expectation of AST.GetExpectations(statement.block)) {
      await expectValue(expectation, statement.target?.value, driver)
    }
  }
}

function hasExpectations(step: AST.ExpectStatement): boolean {
  return step.expectation !== undefined || (step.block?.statements.length ?? 0) > 0
}

function expectValue(expectation: AST.Expectation, parentTag: OptionalRenderTag, driver: TestDriver): Promise<void> {
  return Switch.kind(expectation, {
    TextExpectation: value => driver.expectText(value.value.value, parentTag),
    InputExpectation: value =>
      driver.expectInput(
        value.target?.value ?? parentTag ?? UserInput.Fail('An input expectation needs a render tag.'),
        value.value.value,
      ),
  })
}

function caseLabel(suite: AST.TestsDeclaration, test: AST.TestDeclaration, options: TestOptions): string {
  return [suite.label?.value, test.label?.value ?? `${options.path}:${lineOf(test, options.source)}`]
    .filter(Boolean).join(' / ')
}

function lineOf(node: AST.Node, source: string): number {
  return Source.positionAt(source, node.range.start).line + 1
}
