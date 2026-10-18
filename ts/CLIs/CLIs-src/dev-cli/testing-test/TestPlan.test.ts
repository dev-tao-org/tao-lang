import { Http, Tests } from '@shared/os'
import {
  executeTestSections,
  planTaoWorkers,
  planTestExecution,
  runFilesSequentially,
  runWorkerBatch,
} from '../testing/TestPlan'

Tests.test('allocates fixed workers to selected sections and splits explicit budgets', () => {
  Tests.expect(planTestExecution({ typescriptArgs: [], taoTarget: '/apps' })).toEqual({
    typescript: { args: [], workers: 2 },
    tao: { target: '/apps', workers: 2 },
    serial: false,
  })
  Tests.expect(planTestExecution({ typescriptArgs: [], taoTarget: '/apps', parallel: '5' })).toEqual({
    typescript: { args: [], workers: 2 },
    tao: { target: '/apps', workers: 3 },
    serial: false,
  })
  Tests.expect(planTestExecution({ taoTarget: '/apps' })).toEqual({
    typescript: undefined,
    tao: { target: '/apps', workers: 2 },
    serial: false,
  })
})

Tests.test('serial mode and a one-worker budget run selected sections in sequence', () => {
  Tests.expect(planTestExecution({ typescriptArgs: [], taoTarget: '/apps', serial: true })).toEqual({
    typescript: { args: [], workers: 1 },
    tao: { target: '/apps', workers: 1 },
    serial: true,
  })
  Tests.expect(planTestExecution({ typescriptArgs: [], taoTarget: '/apps', parallel: '1' }).serial).toBe(true)
})

Tests.test('rejects invalid worker budgets and serial-plus-parallel before execution', () => {
  Tests.expect(() => planTestExecution({ taoTarget: '/apps', parallel: '0' })).toThrow()
  Tests.expect(() => planTestExecution({ taoTarget: '/apps', parallel: '1.5' })).toThrow()
  Tests.expect(() => planTestExecution({ taoTarget: '/apps', serial: true, parallel: true })).toThrow()
})

Tests.test('assigns Tao files to stable contiguous worker chunks with distinct reports', () => {
  Tests.expect(planTaoWorkers(['a.tao', 'b.tao', 'c.tao', 'd.tao', 'e.tao'], ['r1', 'r2'])).toEqual([
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
  const parallel = planTestExecution({ typescriptArgs: [], taoTarget: '/apps' })
  await executeTestSections(parallel, {
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
  const serial = planTestExecution({ typescriptArgs: [], taoTarget: '/apps', serial: true })
  const failures = await executeTestSections(serial, {
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
  const results = await runWorkerBatch(
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
  const controller = Http.createAbortController()
  const executed: string[] = []
  await Tests.expect(runFilesSequentially(['first.tao', 'second.tao'], controller.signal, async file => {
    executed.push(file)
    controller.abort()
    return file
  })).rejects.toThrow('Tao test run interrupted.')
  Tests.expect(executed).toEqual(['first.tao'])
})
