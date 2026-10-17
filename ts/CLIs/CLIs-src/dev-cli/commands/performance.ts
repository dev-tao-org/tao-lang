import { IO } from '@cli-kit'
import { Errors, Timings } from '@shared'
import { Platform } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'
import { registerCommand } from './_command-runner'

/** performanceCommand records the available implementation's repeated performance baselines. */
export default registerCommand({
  name: 'performance',
  description: 'Measure parser startup and full parses; save raw samples and phase summaries.',
  arguments: [{ name: 'target', description: 'Currently parser.', defaultValue: 'parser' }],
  async action(target: string) {
    if (target !== 'parser') {
      Errors.ThrowUserInput('Available performance target: parser')
    }
    const timings = new Timings(`process:${Platform.pid}`)
    await prepareParser(true, timings)
    const { parserPerformance } = await import('../../../../perf/perf-src/parser-performance')
    const { path, summary } = await parserPerformance(timings.samples)
    for (const phase of summary) {
      IO.print(
        `${phase.phase}: median ${phase.medianMs.toFixed(3)}ms, p95 ${phase.p95Ms.toFixed(3)}ms (n=${phase.count})`,
      )
    }
    IO.print('Performance report: ' + path)
  },
})
