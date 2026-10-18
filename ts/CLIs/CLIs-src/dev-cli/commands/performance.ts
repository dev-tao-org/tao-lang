import { IO } from '@cli-kit'
import { Errors, Timings } from '@shared'
import { Platform, Tests } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { registerCommand } from './_command-runner'

/** performanceCommand records the available implementation's repeated performance baselines. */
export default registerCommand({
  name: 'performance',
  description: 'Measure parser/compiler phases, editor updates or two live Expo previews; save raw samples.',
  arguments: [{ name: 'target', description: 'parser, extension or preview.', defaultValue: 'parser' }],
  async action(target: string) {
    if (target === 'extension') {
      return runExtension()
    }
    if (target !== 'parser' && target !== 'preview') {
      Errors.ThrowUserInput('Available performance targets: parser, extension, preview')
    }
    const timings = new Timings(`process:${Platform.pid}`)
    await prepareParser(target === 'parser', timings)
    if (target === 'preview') {
      return runPreview()
    }
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

async function runExtension(): Promise<void> {
  const { prepareExtensionAssets } = await import('../ide/ExtensionBuild')
  await prepareExtensionAssets()
  const { extensionPerformance } = await import('../../../../perf/perf-src/extension-performance')
  const { path, summary } = await extensionPerformance()
  for (const phase of summary) {
    IO.print(
      `${phase.phase}: median ${phase.medianMs.toFixed(3)}ms, p95 ${phase.p95Ms.toFixed(3)}ms (n=${phase.count})`,
    )
  }
  IO.print('Performance report: ' + path)
}

async function runPreview(): Promise<void> {
  await prepareRuntime()
  const { createProject, createWorkspace } = await import('@workspace/Workspace')
  const { previewPerformance } = await import('../../../../perf/perf-src/preview-performance')
  const { Artifacts } = await import('@shared/os')
  const project = await createProject()
  const result = await previewPerformance({
    project,
    workspace: createWorkspace({
      project,
      runtimeOptions: { toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains') },
    }),
    initialSource: await Tests.readApp('Hello World'),
  })
  IO.print('Preview performance report: ' + result.path)
}
