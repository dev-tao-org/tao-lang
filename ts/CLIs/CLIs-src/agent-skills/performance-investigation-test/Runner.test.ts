import { Errors, Json, Try } from '@shared'
import { FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { runWithEvidence } from '../performance-investigation/Evidence'
import type { MeasurementJob } from '../performance-investigation/Runner'
import { collectSamples } from '../performance-investigation/RunnerSamples'
import { summarizeJob } from '../performance-investigation/Summary'

Tests.test('measurement failure retains completed samples and records a failed job', async () => {
  await withDirectory(async directory => {
    const job = createJob()
    const report = Path.join(directory, 'raw.json')
    await FileSystem.writeFile(report, '{"retained":true}')
    let calls = 0
    await Tests.expect(collectSamples(directory, job, async () => {
      calls++
      if (calls === 2) {
        Errors.ThrowUserInput('Fixture measurement failed')
      }
      return report
    })).rejects.toThrow('Fixture measurement failed')
    const saved = Json.Parse(
      await FileSystem.readFile(Path.join(directory, 'job.json'), 'utf8'),
    ) as MeasurementFixtureRecord
    Tests.expect(saved.status).toBe('failed')
    Tests.expect(saved.samples).toEqual(['sample-1.json'])
    Tests.expect(saved.finishedAt).toBeString()
    Tests.expect(await FileSystem.readFile(Path.join(directory, 'sample-1.json'), 'utf8')).toBe('{"retained":true}')
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
      await FileSystem.writeFile(report, Json.Print(createReport(job, calls)))
      return report
    })
    const summary = await summarizeJob(directory)
    Tests.expect(summary.groups.find(group => group.name === 'warm/text')).toEqual({
      name: 'warm/text',
      sessions: 2,
      medianMs: 25,
      minMs: 15,
      maxMs: 35,
      runMediansMs: [15, 35],
    })
    const path = Path.join(directory, 'sample-2.json')
    const changed = (await FileSystem.readFile(path, 'utf8')).replace('Fixture browser', 'Different browser')
    await FileSystem.writeFile(path, changed)
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('conditions changed')
    const duplicate = await FileSystem.readFile(Path.join(directory, 'sample-1.json'), 'utf8')
    await FileSystem.writeFile(path, duplicate)
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('Duplicate session')
    const truncated = Json.Parse(duplicate) as MeasurementFixtureRecord
    truncated.results.pop()
    await FileSystem.writeFile(path, Json.Print(truncated))
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('workload is incomplete')
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
    browser: 'Fixture browser',
    runtime: 'Fixture runtime',
    fixtureSha256: 'fixture',
    system: job.system,
    frameSizes: [{ width: 100, height: 100 }, { width: 100, height: 100 }],
    measurement: { editCount: 12, frameCount: 2, extraViews: 0, extraFileCount: 0 },
    results,
  }
}

Tests.test('postvalidation failures retain raw reports and logs even after the command succeeds', async () => {
  await withDirectory(async directory => {
    const logs = Path.join(directory, 'logs')
    await FileSystem.mkdir(logs)
    await Tests.expect(runWithEvidence(directory, [{ directory: logs, label: 'preview' }], async () => {
      await FileSystem.writeFile(Path.join(logs, 'preview.json'), '{"wrongCommit":true}')
      await FileSystem.writeFile(Path.join(logs, 'service.log'), 'diagnostic')
      Errors.ThrowUserInput('Postvalidation failed')
    })).rejects.toThrow('Postvalidation failed')
    Tests.expect(await FileSystem.readFile(Path.join(directory, 'failed-preview-preview.json'), 'utf8'))
      .toBe('{"wrongCommit":true}')
    Tests.expect(await FileSystem.readFile(Path.join(directory, 'failed-preview-service.log'), 'utf8')).toBe(
      'diagnostic',
    )
  })
})

function createResults(session: number) {
  const scenarios = ['text', 'add-text', 'row', 'reset']
  return Array.from({ length: 12 }, (_, index) => {
    const cycle = Math.floor(index / 4) + 1
    const sample = describeFixtureSample(index)
    const duration = (session - 1) * 20 + (cycle === 2 ? 10 : 20)
    return { scenario: `${scenarios[index % 4]}-${cycle}`, sample, parentClickToLastAppliedMs: duration }
  })
}

function describeFixtureSample(index: number): string {
  if (index === 0) {
    return 'first-edit'
  }
  return index < 4 ? 'first-cycle' : 'warm'
}

function createJob(): MeasurementJob {
  return {
    version: 1,
    status: 'running',
    startedAt: '2026-10-28T00:00:00Z',
    commit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    fixtureSha256: 'fixture',
    settings: { repo: '/fixture', fixture: '/fixture.tao', samples: 2, edits: 12 },
    environment: {},
    system: { architecture: 'fixture', kernel: 'fixture', os: 'fixture' },
    samples: [],
  }
}

async function withDirectory(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = Repo.resolvePath('.artifacts/tmp/performance-runner', Platform.randomUUID())
  await FileSystem.mkdir(directory)
  await Try(() => action(directory), { finally: () => FileSystem.rm(directory, { recursive: true, force: true }) })
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type MeasurementFixtureRecord = { status: string; samples: string[]; finishedAt: string; results: unknown[] }
