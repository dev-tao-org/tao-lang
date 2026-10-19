import { formatTimings, IO } from '@cli-kit'
import * as Runtime from '@runtime/Runtime'
import { Errors, Timings } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { projectDependencyOptions } from '@workspace/dependencies/Options'
import { prepareDependencies } from '@workspace/dependencies/Store'
import { openProjectWorkspace } from '@workspace/ProjectWorkspace'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { registerCommand } from './_command-runner'

/** performanceCommand records the available implementation's repeated performance baselines. */
export default registerCommand({
  name: 'performance',
  description: 'Measure parser/compiler phases, editor updates or two live Expo previews; save raw samples.',
  arguments: [{
    name: 'target',
    description: 'parser, formatter, extension, preview or record (current commit).',
    defaultValue: 'parser',
  }],
  async action(target: string) {
    if (target === 'formatter') {
      return runFormatter()
    }
    if (target === 'extension') {
      return runExtension()
    }
    if (!['parser', 'preview', 'record'].includes(target)) {
      Errors.ThrowUserInput('Available performance targets: parser, formatter, extension, preview, record')
    }
    const timings = new Timings(`process:${Platform.pid}`)
    await prepareParser(target === 'parser', timings)
    if (target === 'record') {
      const { recordPreviewPerformance } = await import('../../../../perf/perf-src/PreviewHistory')
      const record = await recordPreviewPerformance(runPreview)
      IO.print(`${record.reused ? 'Existing' : 'Recorded'} commit performance: ${record.directory}`)
      return
    }
    if (target === 'preview') {
      await runPreview()
      return
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

async function runFormatter(): Promise<void> {
  await prepareParser()
  const { formatterPerformance } = await import('../../../../perf/perf-src/formatter-performance')
  const { path, summary } = await formatterPerformance()
  for (const phase of summary) {
    IO.print(
      `${phase.phase}: median ${phase.medianMs.toFixed(3)}ms, p95 ${phase.p95Ms.toFixed(3)}ms (n=${phase.count})`,
    )
  }
  IO.print('Performance report: ' + path)
}

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

async function runPreview(initialSource?: string) {
  await prepareRuntime()
  const { createProject } = await import('@workspace/Workspace')
  const { previewPerformance } = await import('../../../../perf/perf-src/preview-performance')
  const project = await createProject()
  const dependencies = await projectDependencyOptions(project.directory)
  await prepareDependencies(project.directory, await dependencies.readRequirements(project.directory), dependencies)
  const runtimeOptions = { toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains') }
  await Runtime.prepareRuntime({
    ...runtimeOptions,
    install: {
      async install(directory) {
        await FileSystem.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  })
  const result = await previewPerformance({
    project,
    workspace: await openProjectWorkspace(project.directory, {
      id: 'performance',
      runtimeOptions,
    }),
    initialSource: initialSource ?? await Tests.readApp('Hello World'),
  })
  IO.print(`Preview startup: ${result.startupMs.toFixed(1)} ms`)
  for (const [index, timing] of result.reloads.entries()) {
    IO.print(
      `${result.results[index].scenario}: change observed → Metro ${timing.saveToHmrMs.toFixed(1)} ms`
        + ` | both previews applied ${timing.saveToAppliedMs.toFixed(1)} ms`,
    )
    IO.print('  ' + formatTimings(timing.pipeline))
  }
  IO.print('Preview performance report: ' + result.path)
  return result
}
