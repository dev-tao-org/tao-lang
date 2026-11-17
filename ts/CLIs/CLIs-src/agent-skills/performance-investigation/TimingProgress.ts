import { IO } from '@cli-kit'
import { NewlineCharacter, Regxs, Time, Try, UserInput } from '@shared'
import { DevelopmentStorage, FS, Path } from '@shared/os'
import type { PreviewReport } from './ReportContract'

/** timingProgressPath locates the live timing transcript shared by the runner's checkouts. */
export function timingProgressPath(): string {
  return DevelopmentStorage.resolveDirectory('timing', 'transfers', 'live-preview.log')
}

/** describeTimingLabel returns a single-line owner label for the shared transcript. */
export function describeTimingLabel(label?: string): string {
  if (label === undefined) {
    return 'Developer'
  }
  UserInput.require(
    !(!label.trim() || Regxs.RemotePathControlCharacterRegx.test(label)),
    'Use a nonempty, single-line timing label.',
  )
  return label.trim()
}

/** appendTimingProgress records the runner's current progress without affecting measurement validity. */
export async function appendTimingProgress(message: string): Promise<void> {
  const path = timingProgressPath()
  await Try(async () => {
    await FS.mkdirPrivate(Path.dirname(path))
    await FS.writeFile(path, `${Time.date().toISOString()} ${message}${NewlineCharacter}`, { flag: 'a', mode: 0o600 })
  }, { catch: error => IO.warn('Could not write the timing display log:', error) })
}

/** describeTimingSample reports the completed session's startup and slowest warm edit. */
export function describeTimingSample(report: PreviewReport): string {
  const first = report.results[0].parentClickToLastAppliedMs
  const warm = report.results.filter(result => result.sample === 'warm')
  const warmDurations = warm.map(result => result.parentClickToLastAppliedMs)
  const peak = warmDurations.length ? ` · slowest warm edit ${Math.max(...warmDurations).toFixed(1)} ms` : ''
  return `Harness ${report.startupMs.toFixed(0)} ms · first open ${report.opening.firstMs.toFixed(0)} ms · first edit ${
    first.toFixed(1)
  } ms${peak}`
}
