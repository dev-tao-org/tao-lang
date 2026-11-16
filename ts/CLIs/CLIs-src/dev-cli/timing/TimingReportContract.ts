import { Errors, Json, Schema, Try } from '@shared'
import { Path } from '@shared/os'
import { JobFileName } from '../../agent-skills/performance-investigation/JobFiles'
import { type MeasurementJob, parseMeasurementJob } from '../../agent-skills/performance-investigation/Runner'
import { isValidTimingReport } from './TimingReportHistory'

/** TimingReport identifies independent-session medians validated by the runner helper. */
export type TimingReport = TimingSummary & TimingProvenance

type TimingSummary = Schema.infer<typeof timingSummarySchema>
type TimingProvenance = { runner: string; startedAt: string; finishedAt: string }
type TimingReportPayload = { summary: string; manifest: string; job: string; runner: string }

/** parseTimingReport validates the runner summary against its original completed job manifest. */
export function parseTimingReport(payload: TimingReportPayload): TimingReport {
  const summaries = parseTimingSummaries(payload.summary)
  const [summary] = summaries
  if (summaries.length !== 1 || summary?.directory !== payload.job) {
    Errors.ThrowHostEnvironment('The runner did not return the requested timing report.')
  }
  const jobPath = Path.posix.join(payload.job, JobFileName)
  const job = parseMeasurementJob(payload.manifest, jobPath)
  if (!matchesSummarizedJob(job, summary)) {
    Errors.ThrowHostEnvironment('The runner job identity no longer matches its timing summary.')
  }
  const report = withJobProvenance(summary, job, payload.runner)
  if (!isValidTimingReport(report)) {
    Errors.ThrowHostEnvironment('The runner returned incomplete timing provenance or measurements.')
  }
  return report
}

function withJobProvenance(summary: TimingSummary, job: MeasurementJob, runner: string): TimingReport {
  return { ...summary, runner, startedAt: job.startedAt, finishedAt: job.finishedAt! }
}

function matchesSummarizedJob(job: MeasurementJob, report: TimingSummary): boolean {
  return isPassedJob(job) && matchesJobIdentity(job, report) && matchesJobSettings(job, report)
}

function isPassedJob(job: MeasurementJob): boolean {
  return !!job && job.status === 'passed'
}

function matchesJobIdentity(job: MeasurementJob, report: TimingSummary): boolean {
  return job.commit === report.commit && job.tree === report.tree && job.fixtureSha256 === report.fixtureSha256
}

function matchesJobSettings(job: MeasurementJob, report: TimingSummary): boolean {
  return job.settings?.edits === report.settings?.edits && job.settings?.samples === report.settings?.samples
}

function parseTimingSummaries(text: string): TimingSummary[] {
  return Try(() => Json.Parse(text, { schema: Schema.array(timingSummarySchema) }), {
    catch: () => Errors.ThrowHostEnvironment('The runner returned incomplete timing provenance or measurements.'),
  })
}

const timingSummarySchema = Schema.looseObject({
  directory: Schema.string(),
  commit: Schema.string(),
  tree: Schema.string(),
  fixtureSha256: Schema.string(),
  settings: Schema.looseObject({
    repo: Schema.string(),
    fixture: Schema.string(),
    samples: Schema.number(),
    edits: Schema.number(),
  }),
  conditions: Schema.looseObject({
    system: Schema.unknown(),
    runtime: Schema.string(),
    browser: Schema.string(),
    measurement: Schema.unknown(),
    frameSizes: Schema.array(Schema.unknown()),
  }),
  groups: Schema.array(Schema.looseObject({
    name: Schema.string(),
    sessions: Schema.number(),
    medianMs: Schema.number(),
    minMs: Schema.number(),
    maxMs: Schema.number(),
    runMediansMs: Schema.array(Schema.number()),
  })),
  interpretation: Schema.string(),
})
