import { Errors, Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Platform, Repo } from '@shared/os'
import { runWithEvidence } from '../../../CLIs-src/agent-skills/performance-investigation/Evidence'
import type { MeasurementJob } from '../../../CLIs-src/agent-skills/performance-investigation/Runner'
import { collectSamples } from '../../../CLIs-src/agent-skills/performance-investigation/RunnerSamples'
import { summarizeJob } from '../../../CLIs-src/agent-skills/performance-investigation/Summary'

Tests.test('measurement failure retains completed samples and records a failed job', async () => {
  await withDirectory(async directory => {
    const job = createJob()
    const report = Path.join(directory, 'raw.json')
    await FS.writeFile(report, '{"retained":true}')
    let calls = 0
    await Tests.expect(collectSamples(directory, job, async () => {
      calls++
      if (calls === 2) {
        Errors.ThrowUserInput('Fixture measurement failed')
      }
      return report
    })).rejects.toThrow('Fixture measurement failed')
    const saved = JSON.parse(await FS.readFile(Path.join(directory, 'job.json'), 'utf8'))
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
      await FS.writeFile(report, JSON.stringify(createReport(job, calls)))
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
    const changed = (await FS.readFile(path, 'utf8')).replace('Fixture browser', 'Different browser')
    await FS.writeFile(path, changed)
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('conditions changed')
    const duplicate = await FS.readFile(Path.join(directory, 'sample-1.json'), 'utf8')
    await FS.writeFile(path, duplicate)
    await Tests.expect(summarizeJob(directory)).rejects.toThrow('Duplicate session')
    const truncated = JSON.parse(duplicate)
    truncated.results.pop()
    await FS.writeFile(path, JSON.stringify(truncated))
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
    await FS.mkdir(logs)
    await Tests.expect(runWithEvidence(directory, [{ directory: logs, label: 'preview' }], async () => {
      await FS.writeFile(Path.join(logs, 'preview.json'), '{"wrongCommit":true}')
      await FS.writeFile(Path.join(logs, 'service.log'), 'diagnostic')
      Errors.ThrowUserInput('Postvalidation failed')
    })).rejects.toThrow('Postvalidation failed')
    Tests.expect(await FS.readFile(Path.join(directory, 'failed-preview-preview.json'), 'utf8'))
      .toBe('{"wrongCommit":true}')
    Tests.expect(await FS.readFile(Path.join(directory, 'failed-preview-service.log'), 'utf8')).toBe(
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
  await FS.mkdir(directory)
  await Try(() => action(directory), { finally: () => FS.rm(directory, { recursive: true, force: true }) })
}
