import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import * as Runtime from '@runtime'
import { Errors, Timings } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Repo } from '@shared/os'
import * as Workspace from '@workspace'

import * as Perf from '@perf'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { registerCommand } from './_command-runner'

/** performanceCommand records the available implementation's repeated performance baselines. */
export default registerCommand({
  name: 'performance',
  description: 'Measure language phases, reactive policies, editor updates or live Expo previews; save raw samples.',
  arguments: [{
    name: 'target',
    description: 'parser, formatter, reactivity, modules, extension, preview or record (current commit).',
    defaultValue: 'parser',
  }],
  options: [{ flags: '--fixture <path>', description: 'Canonical Tao fixture for preview comparisons.' }],
  action: Timings.createTopLevelTimer(async function(timings, target: string, options: { fixture?: string }) {
    if (options.fixture && target !== 'preview') {
      Errors.ThrowUserInput('--fixture is available only for performance preview.')
    }
    if (target === 'modules') {
      return runModules()
    }
    if (target === 'reactivity') {
      return runReactivity()
    }
    if (target === 'formatter') {
      return runFormatter()
    }
    if (target === 'extension') {
      return runExtension()
    }
    if (!['parser', 'preview', 'record'].includes(target)) {
      Errors.ThrowUserInput(
        'Available performance targets: parser, formatter, reactivity, modules, extension, preview, record',
      )
    }
    await timings.run(prepareParser, target === 'parser')
    if (target === 'record') {
      const { recordPreviewPerformance } = await import('@perf')
      const record = await recordPreviewPerformance(runPreview)
      IO.print(`${record.reused ? 'Existing' : 'Recorded'} commit performance: ${record.directory}`)
      return
    }
    if (target === 'preview') {
      const source = options.fixture
        ? await FS.readFile(CLIKit.resolveCallerPath(options.fixture), 'utf8')
        : undefined
      await runPreview(source)
      return
    }
    const { parserPerformance } = await import('@perf')
    const { path, summary } = await parserPerformance(timings.samples)
    for (const phase of summary) {
      IO.print(
        `${phase.phase}: median ${phase.medianMs.toFixed(3)}ms, p95 ${phase.p95Ms.toFixed(3)}ms (n=${phase.count})`,
      )
    }
    IO.print('Performance report: ' + path)
  }),
})

async function runModules(): Promise<void> {
  await prepareRuntime()
  const { moduleRefreshPerformance } = await import('@perf')
  const { path, summary } = await moduleRefreshPerformance()
  for (const result of summary) {
    IO.print(`${result.layout}: median ${result.medianMs.toFixed(1)} ms, p95 ${result.p95Ms.toFixed(1)} ms`)
  }
  IO.print('Experimental module refresh report: ' + path)
}

async function runReactivity(): Promise<void> {
  const { reactivityPerformance } = await import('@perf')
  const { path, summary } = await reactivityPerformance()
  for (const result of summary) {
    IO.print(`${result.candidate}/${result.scenario}: median ${result.medianMs.toFixed(3)} ms per 1000 operations`)
  }
  IO.print('Synthetic runtime policy report (not preview latency): ' + path)
}

async function runFormatter(): Promise<void> {
  await prepareParser()
  const { formatterPerformance } = await import('@perf')
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
  const { extensionPerformance } = await import('@perf')
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
  const { createProject } = await import('@workspace')
  const { previewPerformance } = await import('@perf')
  const project = await createProject()
  const dependencies = await Workspace.createProjectDependencyOptions(project.directory)
  await Workspace.prepareDependencies(
    project.directory,
    await dependencies.readRequirements(project.directory),
    dependencies,
  )
  const runtimeOptions = { toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains') }
  await Runtime.prepareRuntime({
    ...runtimeOptions,
    install: {
      async install(directory) {
        await FS.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  })
  const result = await previewPerformance({
    project,
    workspace: await Workspace.openProjectWorkspace(project.directory, {
      id: 'performance',
      runtimeOptions,
    }),
    initialSource: initialSource ?? await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao'),
  })
  IO.print(`Preview startup: ${result.startupMs.toFixed(1)} ms`)
  for (const { scenario, timing } of Perf.describePreviewOutput(result)) {
    if (!timing) {
      IO.warn(`${scenario}: no matching watcher timing; browser samples remain in the raw report.`)
      continue
    }
    IO.print(
      `${scenario}: change observed → Metro ${timing.saveToHmrMs.toFixed(1)} ms`
        + ` | preview quorum applied ${timing.saveToAppliedMs.toFixed(1)} ms`,
    )
    IO.print('  ' + CLIKit.formatTimings(timing.pipeline))
  }
  IO.print('Preview performance report: ' + result.path)
  return result
}
