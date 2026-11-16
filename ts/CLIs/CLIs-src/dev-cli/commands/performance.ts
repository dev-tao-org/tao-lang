import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Errors, Timings, Try } from '@shared'
import { FS, Process } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import * as LocalBaseline from '../preview/LocalPreviewBaseline'
import { preparePreviewProject, startPerformanceEditor } from '../preview/PerformanceProject'
import { registerCommand } from './_command-runner'

type PerformanceOptions = { fixture?: string; baseline?: boolean; reportOnly?: boolean }

/** performanceCommand records the available implementation's repeated performance baselines. */
export default registerCommand({
  name: 'performance',
  description: 'Measure language phases, reactive policies, editor updates or live Expo previews; save raw samples.',
  arguments: [{
    name: 'target',
    description: 'parser, formatter, reactivity, modules, extension, preview, editor or record (current commit).',
    defaultValue: 'parser',
  }],
  options: [
    { flags: '--fixture <path>', description: 'Canonical Tao fixture for preview comparisons.' },
    { flags: '--baseline', description: 'Capture five independent preview sessions for local comparisons.' },
    { flags: '--report-only', description: 'Print the raw preview report path without a baseline comparison.' },
  ],
  action: Timings.createTopLevelTimer(async function(timings, target: string, options: PerformanceOptions) {
    if (target !== 'preview' && hasPreviewOptions(options)) {
      Errors.ThrowUserInput('--fixture, --baseline, and --report-only are available only for performance preview.')
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
    if (!['parser', 'preview', 'editor', 'record'].includes(target)) {
      Errors.ThrowUserInput(
        'Available performance targets: parser, formatter, reactivity, modules, extension, preview, editor, record',
      )
    }
    await timings.run(prepareParser, target === 'parser')
    if (target === 'record') {
      const Performance = await import('@repo-analysis/performance')
      const record = await Performance.recordPreviewPerformance(runPreview)
      IO.print(`${record.reused ? 'Existing' : 'Recorded'} commit performance: ${record.directory}`)
      return
    }
    if (target === 'preview') {
      return await runPreviewTarget(options)
    }
    if (target === 'editor') {
      return await runPerformanceEditor()
    }
    const Performance = await import('@repo-analysis/performance')
    const { path, summary } = await Performance.parserPerformance(timings.samples)
    for (const phase of summary) {
      IO.print(
        `${phase.phase}: median ${phase.medianMs.toFixed(3)}ms, p95 ${phase.p95Ms.toFixed(3)}ms (n=${phase.count})`,
      )
    }
    IO.print('Performance report: ' + path)
  }),
})

function hasPreviewOptions(options: PerformanceOptions): boolean {
  return Boolean(options.fixture || options.baseline || options.reportOnly)
}

async function runModules(): Promise<void> {
  await prepareRuntime()
  const Performance = await import('@repo-analysis/performance')
  const { path, summary } = await Performance.moduleRefreshPerformance()
  for (const result of summary) {
    IO.print(`${result.layout}: median ${result.medianMs.toFixed(1)} ms, p95 ${result.p95Ms.toFixed(1)} ms`)
  }
  IO.print('Experimental module refresh report: ' + path)
}

async function runReactivity(): Promise<void> {
  const Performance = await import('@repo-analysis/performance')
  const { path, summary } = await Performance.reactivityPerformance()
  for (const result of summary) {
    IO.print(`${result.candidate}/${result.scenario}: median ${result.medianMs.toFixed(3)} ms per 1000 operations`)
  }
  IO.print('Synthetic runtime policy report (not preview latency): ' + path)
}

async function runFormatter(): Promise<void> {
  await prepareParser()
  const Performance = await import('@repo-analysis/performance')
  const { path, summary } = await Performance.formatterPerformance()
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
  const Performance = await import('@repo-analysis/performance')
  const { path, summary } = await Performance.extensionPerformance()
  for (const phase of summary) {
    IO.print(
      `${phase.phase}: median ${phase.medianMs.toFixed(3)}ms, p95 ${phase.p95Ms.toFixed(3)}ms (n=${phase.count})`,
    )
  }
  IO.print('Performance report: ' + path)
}

async function runPreviewTarget(options: PerformanceOptions): Promise<void> {
  if (options.baseline) {
    if (options.fixture) {
      Errors.ThrowUserInput('Capture the baseline on the fixed performance project.')
    }
    return await LocalBaseline.recordLocalPreviewBaseline()
  }
  const source = options.fixture
    ? await FS.readFile(CLIKit.resolveCallerPath(options.fixture), 'utf8')
    : undefined
  const result = await runPreview(source)
  if (!options.reportOnly && !options.fixture) {
    await LocalBaseline.printLocalPreviewChanges(result.path)
  }
  IO.summary(LocalBaseline.PreviewPerformanceReportPrefix + result.path)
}

async function runPreview(initialSource?: string) {
  const Performance = await import('@repo-analysis/performance')
  const options = await preparePreviewProject(initialSource)
  const result = await Performance.previewPerformance(options)
  for (const { scenario, timing } of Performance.describePreviewOutput(result)) {
    if (!timing) {
      IO.warn(`${scenario}: no matching save timing; browser samples remain in the raw report.`)
    }
  }
  return result
}

async function runPerformanceEditor(): Promise<void> {
  const harness = await startPerformanceEditor()
  await Try(() => Process.waitForTermination(), { finally: () => harness.dispose() })
}
