import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'

import { Errors, S } from '@shared'
import { Cancellation } from '@shared/web'
import { runTests, type TestDriver } from '../workspace-src/testing/RunTests'

Tests.test('app journeys execute in order with inherited assertion targets and fresh drivers', async () => {
  const source = S`
    tests "Forms" {
      test "Edit" {
        run Example
        type "Hello" into #name
        press #save
        expect { text "Saved" }
        expect #name { input value "Hello" }
      }
      test { run Example expect text "Ready" }
    }
  `
  const operations: string[] = []
  const result = await runTests(parse(source), {
    path: '/virtual/forms.tao',
    source,
    async createDriver() {
      operations.push('new')
      return recordingDriver(operations)
    },
  })
  Tests.expect(result.map(test => test.status)).toEqual(['passed', 'passed'])
  Tests.expect(operations).toEqual([
    'new',
    'run:Example',
    'type:name:Hello',
    'press:save',
    'text:Saved',
    'input:name:Hello',
    'dispose',
    'new',
    'run:Example',
    'text:Ready',
    'dispose',
  ])
  Tests.expect(result[0]?.label).toBe('Forms / Edit')
})

Tests.test('a failed assertion stops its journey, reports the source line and still disposes its driver', async () => {
  const source = S`
    tests {
      test {
        run Example
        expect text "Missing"
        press #never
      }
    }
  `
  const operations: string[] = []
  const result = await runTests(parse(source), {
    path: '/virtual/failing.tao',
    source,
    createDriver: async () => ({
      ...recordingDriver(operations),
      async expectText() {
        Errors.ThrowUserInput('Expected visible text "Missing"')
      },
    }),
  })
  Tests.expect(result[0]).toMatchObject({ status: 'failed', line: 4 })
  Tests.expect(result[0]?.error).toContain('Missing')
  Tests.expect(operations).toEqual(['run:Example', 'dispose'])
})

Tests.test('interrupting a journey disposes its driver and skips remaining cases', async () => {
  const source = 'tests { test { run Example expect text "Ready" } test { run Example expect text "Ready" } }'
  const controller = Cancellation.createController()
  const operations: string[] = []
  const result = await runTests(parse(source), {
    path: '/virtual/interrupted.tao',
    source,
    signal: controller.signal,
    async createDriver() {
      operations.push('new')
      return {
        ...recordingDriver(operations),
        async run() {
          operations.push('interrupt')
          controller.abort()
        },
      }
    },
  })
  Tests.expect(result).toHaveLength(1)
  Tests.expect(result[0]?.status).toBe('failed')
  Tests.expect(result[0]?.error).toContain('interrupted')
  Tests.expect(operations).toEqual(['new', 'interrupt', 'dispose'])
})

function parse(source: string) {
  return AST.transform(Grammar.createParser().parse(source))!
}

function recordingDriver(operations: string[]): TestDriver {
  return {
    async run(app) {
      operations.push(`run:${app}`)
    },
    async press(tag) {
      operations.push(`press:${tag}`)
    },
    async type(tag, value) {
      operations.push(`type:${tag}:${value}`)
    },
    async expectText(value) {
      operations.push(`text:${value}`)
    },
    async expectInput(tag, value) {
      operations.push(`input:${tag}:${value}`)
    },
    async dispose() {
      operations.push('dispose')
    },
  }
}
