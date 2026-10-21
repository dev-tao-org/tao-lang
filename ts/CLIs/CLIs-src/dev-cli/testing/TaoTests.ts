import { IO } from '@cli-kit'
import { Path } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { planTestExecution } from './TestPlan'
import { runTestPlan, type TestExecutionOptions } from './TestWorkers'

export * from './TaoTestDiscovery'

/** runTaoTests runs self-contained app journeys using the default headless web target. */
export async function runTaoTests(target: string, options: TestExecutionOptions = {}): Promise<void> {
  planTestExecution({ taoTarget: target, ...options })
  IO.progress('Preparing headless Tao app tests…')
  await prepareParser()
  await prepareRuntime()
  await runTestPlan({ taoTarget: Path.resolve(target), ...options })
}
