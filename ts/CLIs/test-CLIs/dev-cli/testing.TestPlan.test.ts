import * as Tests from '@shared-tests'
import { Cancellation } from '@shared/web'
import * as TestPlan from '../../CLIs-src/dev-cli/testing/TestPlan'

Tests.test('keeps Tao on one worker and caps TypeScript within the total budget', () => {
  Tests.expect(TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps' })).toEqual({
    typescript: { args: [], workers: 5 },
    tao: { target: '/apps', workers: 1 },
    serial: false,
  })
  Tests.expect(TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps', parallel: '5' })).toEqual({
    typescript: { args: [], workers: 4 },
    tao: { target: '/apps', workers: 1 },
    serial: false,
  })
  Tests.expect(TestPlan.planTestExecution({ taoTarget: '/apps' })).toEqual({
    typescript: undefined,
    tao: { target: '/apps', workers: 1 },
    serial: false,
  })
  Tests.expect(TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps', parallel: '6' })).toEqual({
    typescript: { args: [], workers: 5 },
    tao: { target: '/apps', workers: 1 },
    serial: false,
  })
  Tests.expect(TestPlan.planTestExecution({ typescriptArgs: [] }).typescript?.workers).toBe(5)
  Tests.expect(TestPlan.planTestExecution({ taoTarget: '/apps', parallel: '6' }).tao?.workers).toBe(1)
  Tests.expect(TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps', parallel: '2' })).toEqual({
    typescript: { args: [], workers: 1 },
    tao: { target: '/apps', workers: 1 },
    serial: false,
  })
})

Tests.test('serial mode and a one-worker budget run selected sections in sequence', () => {
  Tests.expect(TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps', serial: true })).toEqual({
    typescript: { args: [], workers: 1 },
    tao: { target: '/apps', workers: 1 },
    serial: true,
  })
  Tests.expect(TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps', parallel: '1' }).serial).toBe(true)
})

Tests.test('rejects invalid worker budgets and serial-plus-parallel before execution', () => {
  Tests.expect(() => TestPlan.planTestExecution({ taoTarget: '/apps', parallel: '0' })).toThrow()
  Tests.expect(() => TestPlan.planTestExecution({ taoTarget: '/apps', parallel: '1.5' })).toThrow()
  Tests.expect(() => TestPlan.planTestExecution({ taoTarget: '/apps', serial: true, parallel: true })).toThrow()
})

Tests.test('assigns Tao files to stable contiguous worker chunks with distinct reports', () => {
  Tests.expect(TestPlan.planTaoWorkers(['a.tao', 'b.tao', 'c.tao', 'd.tao', 'e.tao'], ['r1', 'r2'])).toEqual([
    { index: 0, paths: ['a.tao', 'b.tao', 'c.tao'], reportPath: 'r1' },
    { index: 1, paths: ['d.tao', 'e.tao'], reportPath: 'r2' },
  ])
})

Tests.test('runs sections concurrently by default and serially in TypeScript-then-Tao order', async () => {
  const parallelEvents: string[] = []
  let releaseTypeScript: () => void = () => {}
  const waitForTao = new Promise<void>(resolve => {
    releaseTypeScript = resolve
  })
  const parallel = TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps' })
  await TestPlan.executeTestSections(parallel, {
    async typescript() {
      parallelEvents.push('typescript-start')
      await waitForTao
      parallelEvents.push('typescript-finish')
    },
    async tao() {
      parallelEvents.push('tao-start')
      releaseTypeScript()
    },
  })
  Tests.expect(parallelEvents).toEqual(['typescript-start', 'tao-start', 'typescript-finish'])

  const serialEvents: string[] = []
  const serial = TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps', serial: true })
  const failures = await TestPlan.executeTestSections(serial, {
    async typescript() {
      serialEvents.push('typescript')
      throw new Error('TypeScript failed')
    },
    async tao() {
      serialEvents.push('tao')
    },
  })
  Tests.expect(serialEvents).toEqual(['typescript', 'tao'])
  Tests.expect(failures).toEqual({ typescript: 'Error: TypeScript failed' })
})

Tests.test('waits for every started worker and retains a rejected worker result', async () => {
  const events: string[] = []
  let releaseFirst: () => void = () => {}
  const waitForSecond = new Promise<void>(resolve => {
    releaseFirst = resolve
  })
  const results = await TestPlan.runWorkerBatch(
    [1, 2],
    async worker => {
      events.push(`worker-${worker}-start`)
      if (worker === 1) {
        await waitForSecond
        events.push('worker-1-finish')
        throw new Error('worker failed')
      }
      events.push('worker-2-finish')
      releaseFirst()
      return 'worker-2-report'
    },
    (worker, error) => `worker-${worker}-error: ${String(error)}`,
  )
  Tests.expect(events).toEqual(['worker-1-start', 'worker-2-start', 'worker-2-finish', 'worker-1-finish'])
  Tests.expect(results).toEqual(['worker-1-error: Error: worker failed', 'worker-2-report'])
})

Tests.test('cancellation between Tao files stops the batch and cannot return partial success', async () => {
  const controller = Cancellation.createController()
  const executed: string[] = []
  await Tests.expect(TestPlan.runFilesSequentially(['first.tao', 'second.tao'], controller.signal, async file => {
    executed.push(file)
    controller.abort()
    return file
  })).rejects.toThrow('Tao test run interrupted.')
  Tests.expect(executed).toEqual(['first.tao'])
})

Tests.test('cancelling a serial section does not start the next section', async () => {
  const controller = Cancellation.createController()
  const executed: string[] = []
  const plan = TestPlan.planTestExecution({ typescriptArgs: [], taoTarget: '/apps', serial: true })
  await Tests.expect(TestPlan.executeTestSections(plan, {
    async typescript() {
      executed.push('typescript')
      controller.abort()
    },
    async tao() {
      executed.push('tao')
    },
  }, controller.signal)).rejects.toThrow('Tao test run interrupted.')
  Tests.expect(executed).toEqual(['typescript'])
})
