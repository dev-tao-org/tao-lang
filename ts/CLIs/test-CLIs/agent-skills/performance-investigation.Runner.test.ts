import * as Performance from '@repo-analysis/performance'
import { Json, UserInput } from '@shared'
import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Platform, Repo } from '@shared/os'
import * as BranchMetrics from '../../CLIs-src/agent-skills/performance-investigation/BranchMetrics'
import { formatBranchComparison } from '../../CLIs-src/agent-skills/performance-investigation/BranchReport'
import { runWithEvidence } from '../../CLIs-src/agent-skills/performance-investigation/Evidence'
import type { PreviewReport } from '../../CLIs-src/agent-skills/performance-investigation/ReportContract'
import type { MeasurementJob } from '../../CLIs-src/agent-skills/performance-investigation/Runner'
import { collectSamples } from '../../CLIs-src/agent-skills/performance-investigation/RunnerSamples'
import { summarizeJob } from '../../CLIs-src/agent-skills/performance-investigation/Summary'
import { parseTimingReport } from '../../CLIs-src/dev-cli/timing/TimingReportContract'

Tests.test('measurement failure retains completed samples and records a failed job', async () => {
  await withDirectory(async directory => {
    const job = createJob()
    const report = Path.join(directory, 'raw.json')
    await FS.writeFile(report, '{"retained":true}')
    let calls = 0
    await Tests.expect(collectSamples(directory, job, async () => {
      calls++
      UserInput.require(calls !== 2, 'Fixture measurement failed')
      return report
    })).rejects.toThrow('Fixture measurement failed')
    const saved = Json.Parse(await FS.readFile(Path.join(directory, 'job.json'), 'utf8')) as MeasurementFixtureRecord
    Tests.expect(saved.status).toBe('failed')
    Tests.expect(saved.samples).toEqual(['sample-1.json'])
    Tests.expect(saved.finishedAt).toBeString()
    Tests.expect(await FS.readFile(Path.join(directory, 'sample-1.json'), 'utf8')).toBe('{"retained":true}')
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('complete passed job')
  })
})

Tests.test('summaries keep warm edits grouped by independent session and reject changing conditions', async () => {
  await withDirectory(async directory => {
    const job = createJob()
    let calls = 0
    const report = Path.join(directory, 'raw.json')
    await collectSamples(directory, job, async () => {
      calls++
      await FS.writeFile(report, Json.Print(createReport(job, calls)))
      return report
    })
    const summary = await summarizeJob(directory)
    const manifest = await FS.readFile(Path.join(directory, 'job.json'), 'utf8')
    const payload = { summary: Json.Print([summary]), manifest, job: directory, runner: 'runner-fixture' }
    const collected = parseTimingReport(payload)
    Tests.expect(collected.runner).toBe('runner-fixture')
    Tests.expect(collected.finishedAt).toBeString()
    Tests.expect(collected.groups).toEqual(summary.groups)
    Tests.expect(summary.groups.find(group => group.name === 'warm/text')).toEqual({
      name: 'warm/text',
      sessions: 2,
      medianMs: 25,
      minMs: 15,
      maxMs: 35,
      runMediansMs: [15, 35],
    })
    const path = Path.join(directory, 'sample-2.json')
    const changed = (await FS.readFile(path, 'utf8')).replace('Fixture browser', 'Different browser')
    await FS.writeFile(path, changed)
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('conditions changed')
    const duplicate = await FS.readFile(Path.join(directory, 'sample-1.json'), 'utf8')
    await FS.writeFile(path, duplicate)
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('Duplicate session')
    const truncated = Json.Parse(duplicate) as MeasurementFixtureRecord
    truncated.results.pop()
    await FS.writeFile(path, Json.Print(truncated))
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('workload is incomplete')
    const invalidOpening = { firstMs: 350, reopenMs: { length: 3 } }
    await FS.writeFile(path, Json.Print({ ...createReport(job, 2), opening: invalidOpening }))
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('Invalid preview report')
  })
})

function createReport(job: MeasurementJob, session: number) {
  const sessionId = `session-${session}`
  const results = createResults(session)
  return {
    version: 1,
    sessionId,
    commit: job.commit,
    modified: false,
    startupMs: 100,
    opening: { firstMs: 350, reopenMs: [20, 25, 30] },
    browser: 'Fixture browser',
    runtime: 'Fixture runtime',
    fixtureSha256: 'fixture',
    system: job.system,
    frameSizes: [{ width: 100, height: 100 }, { width: 100, height: 100 }],
    measurement: {
      editCount: 24,
      frameCount: 2,
      extraViews: 240,
      extraFileCount: 24,
      protocol: Performance.PreviewMeasurementProtocol,
    },
    results,
  }
}

Tests.test('postvalidation failures retain raw reports and logs even after the command succeeds', async () => {
  await withDirectory(async directory => {
    const logs = Path.join(directory, 'logs')
    await FS.mkdir(logs)
    await Tests.expect(runWithEvidence(directory, [{ directory: logs, label: 'preview' }], async () => {
      await FS.writeFile(Path.join(logs, 'preview.json'), '{"wrongCommit":true}')
      await FS.writeFile(Path.join(logs, 'service.log'), 'diagnostic')
      UserInput.fail('Postvalidation failed')
    })).rejects.toThrow('Postvalidation failed')
    Tests.expect(await FS.readFile(Path.join(directory, 'failed-preview-preview.json'), 'utf8'))
      .toBe('{"wrongCommit":true}')
    Tests.expect(await FS.readFile(Path.join(directory, 'failed-preview-service.log'), 'utf8')).toBe('diagnostic')
  })
})

Tests.test('branch verdicts require paired agreement and a repeated tier while keeping tail and restart evidence', () => {
  const baseline = [50, 60, 70, 80, 90].map(createBranchSession)
  const slower = [60, 70, 80, 90, 100].map(createBranchSession)
  const reversed = slower.toReversed()
  const large = [70, 80, 90, 100, 110].map(createBranchSession)
  const first = readWarmMedian(baseline, slower)
  const noisy = readWarmMedian(baseline, reversed)
  const second = readWarmMedian(baseline, large)
  const equalMedians = readWarmMedian(baseline, [60, 70, 80, 90, 50].map(createBranchSession))
  Tests.expect(equalMedians.deltaMs).toBe(0)
  Tests.expect(equalMedians.pairedDeltaMs).toBe(10)
  Tests.expect(equalMedians.change).toBe('warning')
  Tests.expect(first.change).toBe('warning')
  Tests.expect(first.candidate.madMs).toBe(10)
  Tests.expect(noisy.change).toBe('variable')
  Tests.expect(second.change).toBe('error')
  Tests.expect(BranchMetrics.confirmMetricChange(first, second)).toBe('warning')
  Tests.expect(BranchMetrics.confirmMetricChange(first, noisy)).toBe('variable')
  const { warmBudgetMisses, frameRestartEdits, observedTransitions, comparableTransitions } = BranchMetrics
    .countPreviewQuality(baseline)
  Tests.expect(warmBudgetMisses).toBe(5)
  Tests.expect(frameRestartEdits).toBe(5)
  Tests.expect(observedTransitions).toBe(115)
  Tests.expect(comparableTransitions).toBe(115)
  const tail = BranchMetrics.compareBranchMetrics({ baseline, candidate: slower }).find(metric =>
    metric.name === 'Warm p95'
  )
  Tests.expect(tail?.candidate.medianMs).toBe(150)
  assertBranchReport(baseline, slower, large)
  const zeroBaseline = [0, 60, 70, 80, 90].map(createBranchSession)
  const zeroCandidate = [10, 70, 80, 90, 100].map(createBranchSession)
  const report = renderBranchReport(zeroBaseline, [zeroCandidate])
  Tests.expect(report).toContain('Paired percentage unavailable. 5 of 5 pairs agreed.')
})

function assertBranchReport(baseline: PreviewReport[], candidate: PreviewReport[], repeat: PreviewReport[]): void {
  const report = renderBranchReport(baseline, [candidate, repeat])
  Tests.expect(report.startsWith('Confirmed ')).toBe(true)
  Tests.expect(report).toContain('Typical warm edit — +14.3% (+10.00 ms). Slowdown (warning). Repeat measured +28.6%')
  Tests.expect(report).toContain('Slow warm edit (p95)')
  Tests.expect(report).toContain('Warm preview reopen')
  Tests.expect(report).toContain('Warm render steps')
  Tests.expect(report).toContain('Edit mounted dependency')
  Tests.expect(report).toContain('generated paths changed 2 / 2 · Metro delta modules — / —')
  Tests.expect(report).toContain('Edits with a frame restart: 10/230 vs 10/230 baseline')
}

function renderBranchReport(baseline: PreviewReport[], comparisons: PreviewReport[][]): string {
  const rounds = comparisons.map(sessions => ({
    jobs: { baseline: baseline.map(report => report.sessionId), candidate: sessions.map(report => report.sessionId) },
    metrics: BranchMetrics.compareBranchMetrics({ baseline, candidate: sessions }),
    quality: {
      baseline: BranchMetrics.countPreviewQuality(baseline),
      candidate: BranchMetrics.countPreviewQuality(sessions),
    },
    work: { baseline: BranchMetrics.describeWarmWork(baseline), candidate: BranchMetrics.describeWarmWork(sessions) },
  }))
  return formatBranchComparison({
    directory: '/fixture',
    status: 'passed',
    startedAt: '2026-11-14T00:00:00Z',
    options: { baseline: '/baseline', candidate: '/candidate', pairs: 5 },
    commits: { baseline: 'baseline', candidate: 'candidate' },
    fixtureSha256: 'fixture',
    scenarios: [{ name: 'Small app', load: { extraViews: 0, extraFileCount: 0 }, rounds }],
  })
}

function createBranchSession(duration: number): PreviewReport {
  const report = createReport(createJob(), duration)
  const results = report.results.map((edit, index) => ({
    ...edit,
    parentClickToLastAppliedMs: index === 11 ? 150 : duration,
    frames: {
      left: { bootId: index < 6 ? 'start' : 'restarted' },
      right: { bootId: 'start' },
    },
  }))
  return { ...report, measurement: { ...report.measurement, frameCount: 2 }, results }
}

function readWarmMedian(baseline: PreviewReport[], candidate: PreviewReport[]) {
  return BranchMetrics.compareBranchMetrics({ baseline, candidate }).find(metric => metric.name === 'Warm p50')!
}

function createResults(session: number) {
  const scenarios = [
    'text',
    'local-expand',
    'local-shrink',
    'imported-mount',
    'imported-expand',
    'dependency-edit',
    'imported-shrink',
    'reset',
  ]
  return Array.from({ length: 24 }, (_, index) => {
    const cycle = Math.floor(index / 8) + 1
    const sample = describeFixtureSample(index)
    const duration = (session - 1) * 20 + (cycle === 2 ? 10 : 20)
    const work = { moduleDiscoveries: 5, parses: 5, modulesEmitted: 5, generatedPathsChanged: 2 }
    return { scenario: `${scenarios[index % 8]}-${cycle}`, sample, parentClickToLastAppliedMs: duration, work }
  })
}

function describeFixtureSample(index: number): string {
  if (index === 0) {
    return 'first-edit'
  }
  return index < 8 ? 'first-cycle' : 'warm'
}

function createJob(): MeasurementJob {
  return {
    version: 1,
    status: 'running',
    startedAt: '2026-10-28T00:00:00.000Z',
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    fixtureSha256: 'fixture',
    settings: { repo: '/fixture', fixture: '/fixture.tao', samples: 2, edits: 24 },
    environment: {},
    system: { architecture: 'fixture', kernel: 'fixture', os: 'fixture' },
    samples: [],
  }
}

async function withDirectory(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = Repo.resolvePath('.artifacts/tmp/performance-runner', Platform.randomUUID())
  await FS.mkdir(directory)
  await Try(() => action(directory), { finally: () => FS.rm(directory, { recursive: true, force: true }) })
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type MeasurementFixtureRecord = { status: string; samples: string[]; finishedAt: string; results: unknown[] }
