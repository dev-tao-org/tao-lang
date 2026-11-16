import { Json } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { describeTimingComparison } from '../../CLIs-src/dev-cli/timing/TimingComparison'
import { type TimingReport } from '../../CLIs-src/dev-cli/timing/TimingReportContract'
import { readTimingHistory } from '../../CLIs-src/dev-cli/timing/TimingReportHistory'

const PossibleSlowdownRegx =
  /\n\nTiming deviation: POSSIBLE SLOWDOWN — 1 scenario meets both 5% and 2 ms; unconfirmed\.$/
const NoMaterialMedianChangeRegx =
  /Timing deviation: NO MATERIAL MEDIAN CHANGE — no scenario meets both 5% and 2 ms; smaller changes remain possible\.$/
const MissingTimingBaselineRegx = /^Timing deviation: NOT ASSESSED — no previous comparable report on this runner\.$/
const InsufficientSessionsRegx =
  /Timing deviation: NOT ASSESSED — at least 5 independent sessions per job are required\.$/
const MixedChangesRegx = /Timing deviation: MIXED CHANGES — 2 scenarios meet both 5% and 2 ms; unconfirmed\.$/
const PossibleSpeedupRegx = /Timing deviation: POSSIBLE SPEEDUP — 2 scenarios meet both 5% and 2 ms; unconfirmed\.$/

Tests.test('timing reports select the previous comparable measurement and never compare a job with itself', async () => {
  const directory = createReportsDirectory()
  await FS.mkdir(directory)
  const baseline = createReport('baseline', '10', 20)
  await saveReport(directory, baseline)
  await saveReport(directory, { ...createReport('foreign', '10:30', 900), runner: 'another.local' })
  const different = createReport('different', '10:40', 900)
  different.conditions = { ...createConditions(), browser: 'other' }
  await saveReport(directory, different)
  const diagnostic = createReport('diagnostic', '10:50', 900)
  useSingleSession(diagnostic)
  await saveReport(directory, diagnostic)
  await saveReport(directory, createReport('future', '12', 900))
  await FS.writeFile(Path.join(directory, 'invalid.json'), '{')
  const overflow = Json.Print(createReport('overflow', '10:55', 900), { prettyPrint: false })
    .replace('"system":{}', '"system":{"overflow":1e400}')
  await FS.writeFile(Path.join(directory, 'overflow.json'), overflow)
  const current = createReport('current', '11', 25)
  const printed = await describeFromHistory(current, directory)
  await saveReport(directory, current)
  Tests.expect(await describeFromHistory(current, directory)).toBe(printed)
  Tests.expect(printed).toContain('Baseline: baseline · 2026-11-01T10:00:00.000Z')
  Tests.expect(printed).toContain('  Change    This run    Baseline  Metric')
  Tests.expect(printed).toContain('  +25.0%    25.00 ms    20.00 ms  warm/text · session ranges overlap')
  Tests.expect(printed).toContain('Skipped 2 saved report(s) lacking valid provenance or measurements.')
  Tests.expect(printed).toContain(
    'Machine drift control: measured source tree is unchanged; any detected shift requires confirmation.',
  )
  Tests.expect(printed).toMatch(PossibleSlowdownRegx)
})

Tests.test('timing reports screen both materiality floors and separate source changes from machine drift', async () => {
  const directory = createReportsDirectory()
  await FS.mkdir(directory)
  const baseline = createReport('baseline', '10', 40)
  await saveReport(directory, baseline)
  const current = createReport('current', '11', 42)
  current.tree = 'c'.repeat(40)
  const printed = await describeFromHistory(current, directory)
  Tests.expect(printed).toContain('Machine drift cannot be isolated: measured source tree changed.')
  Tests.expect(printed).toContain('POSSIBLE SLOWDOWN')
  await saveReport(directory, current)
  const small = createReport('small', '12', 43.5)
  Tests.expect(await describeFromHistory(small, directory)).toMatch(NoMaterialMedianChangeRegx)
  await saveReport(directory, small)
  const relative = createReport('relative', '13', 45.5)
  Tests.expect(await describeFromHistory(relative, directory)).toContain('NO MATERIAL MEDIAN CHANGE')
})

Tests.test('timing reports disclose missing baselines and insufficient independent sessions', async () => {
  const directory = createReportsDirectory()
  await FS.mkdir(directory)
  const first = createReport('first', '10', 25)
  Tests.expect(await describeFromHistory(first, directory)).toMatch(MissingTimingBaselineRegx)
  await saveReport(directory, first)
  const current = createReport('short', '11', 60)
  useSingleSession(current)
  Tests.expect(await describeFromHistory(current, directory)).toMatch(InsufficientSessionsRegx)
})

Tests.test('timing deviation requires both floors and reports improvements as well as mixed changes', async () => {
  const directory = createReportsDirectory()
  await FS.mkdir(directory)
  const baseline = createReport('baseline', '10', 20)
  baseline.groups.push({ ...createReport('other', '10', 100).groups[0], name: 'warm/row' })
  await saveReport(directory, baseline)
  const small = createReport('small', '11', 21.5)
  small.groups.push({ ...createReport('other', '11', 103).groups[0], name: 'warm/row' })
  Tests.expect(await describeFromHistory(small, directory)).toContain('NO MATERIAL MEDIAN CHANGE')
  await saveReport(directory, small)
  const mixed = createReport('mixed', '12', 10)
  mixed.groups.push({ ...createReport('other', '12', 120).groups[0], name: 'warm/row' })
  Tests.expect(await describeFromHistory(mixed, directory)).toMatch(MixedChangesRegx)
  await saveReport(directory, mixed)
  const faster = createReport('faster', '13', 5)
  faster.groups.push({ ...createReport('other', '13', 100).groups[0], name: 'warm/row' })
  Tests.expect(await describeFromHistory(faster, directory)).toMatch(PossibleSpeedupRegx)
})

async function describeFromHistory(report: TimingReport, directory: string): Promise<string> {
  return describeTimingComparison(report, await readTimingHistory(report, directory))
}

function createReportsDirectory(): string {
  const directory = Artifacts.resolvePath('tmp/timing-comparison', Platform.randomUUID())
  Artifacts.trackTemporary(directory)
  return directory
}

function useSingleSession(report: TimingReport): void {
  const group = report.groups[0]
  report.settings.samples = 1
  report.groups[0] = {
    ...group,
    sessions: 1,
    runMediansMs: [group.medianMs],
    minMs: group.medianMs,
    maxMs: group.medianMs,
  }
}

function createReport(name: string, hour: string, medianMs: number): TimingReport {
  const time = hour.includes(':') ? hour : hour + ':00'
  return {
    directory: '/runner/jobs/' + name,
    runner: 'fixture.local',
    startedAt: `2026-11-01T${time}:00.000Z`,
    finishedAt: `2026-11-01T${time}:30.000Z`,
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    fixtureSha256: 'fixture',
    settings: { repo: '/runner', fixture: '/runner/fixture.tao', samples: 5, edits: 24 },
    conditions: createConditions(),
    groups: [{
      name: 'warm/text',
      sessions: 5,
      medianMs,
      minMs: medianMs - 5,
      maxMs: medianMs + 5,
      runMediansMs: [medianMs - 5, medianMs - 2, medianMs, medianMs + 2, medianMs + 5],
    }],
    interpretation: 'Fixture independent sessions.',
  }
}

function createConditions(): TimingReport['conditions'] {
  return {
    browser: 'fixture',
    runtime: 'fixture',
    system: {},
    measurement: { editCount: 24, frameCount: 2, extraViews: 0, extraFileCount: 0 },
    frameSizes: [{ width: 380, height: 756 }],
  }
}

async function saveReport(directory: string, report: TimingReport): Promise<void> {
  const path = Path.join(directory, Path.basename(report.directory) + '.json')
  await FS.writeFile(path, Json.Print(report))
}
