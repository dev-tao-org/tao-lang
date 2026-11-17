import { IO } from '@cli-kit'
import { Errors, Json, Regxs, Schema, Time } from '@shared'
import Exec, { type CaptureOptions, type CommandResult } from '@shared/os/exec'

type WatchDependencies = {
  capture(command: string, args: readonly string[], options: CaptureOptions): Promise<CommandResult<number>>
  print(message: string): void
  sleep(milliseconds: number): Promise<void>
}

const DefaultWatchDependencies: WatchDependencies = { capture: Exec.capture, print: IO.print, sleep: Time.sleep }

type WatchOptions = { dependencies?: WatchDependencies; expectedHead?: string }

/** watchVerifyRun polls only the exact run and reports its terminal verdict. */
export async function watchVerifyRun(cwd: string, runId: string, options: WatchOptions = {}): Promise<void> {
  const deps = options.dependencies ?? DefaultWatchDependencies
  let etag = ''
  let previousStatus = ''
  for (;;) {
    const observation = await pollVerifyRun(cwd, runId, etag, deps.capture)
    if (observation) {
      etag = observation.etag
      const { run } = observation
      if (options.expectedHead !== undefined && run.head_sha !== options.expectedHead) {
        Errors.ThrowHostEnvironment(
          `GitHub Actions run ${runId} is for ${run.head_sha}, expected ${options.expectedHead}.`,
        )
      }
      if (run.status !== previousStatus) {
        deps.print(`Run ${runId} (${run.conclusion ?? run.status}) ${run.html_url}`)
        previousStatus = run.status
      }
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') {
          Errors.ThrowHostEnvironment(
            `GitHub Actions run ${runId} completed with ${run.conclusion ?? 'no conclusion'}.`,
          )
        }
        return
      }
    }
    await deps.sleep(5000)
  }
}

const RunStatusSchema = Schema.object({
  head_sha: Schema.string(),
  status: Schema.string().min(1),
  conclusion: Schema.string().nullable(),
  html_url: Schema.string(),
})
async function pollVerifyRun(cwd: string, runId: string, etag: string, capture: WatchDependencies['capture']) {
  // Use the canonical repository slug to avoid redirects on every poll.
  const endpoint = `repos/dev-tao-org/tao-lang/actions/runs/${runId}?exclude_pull_requests=true`
  const headers = etag ? ['--header', `If-None-Match: ${etag}`] : []
  const args = ['api', '--hostname', 'github.com', '--include', ...headers, endpoint]
  const response = await capture('gh', args, { cwd, check: false, timeoutMs: 15_000 })
  const code = Number(Regxs.HttpStatusLineRegx.exec(response.stdout)?.[1])
  // gh can report an unchanged HTTP response with a nonzero process status.
  if (code === 304 && etag && response.signal === null) {
    return undefined
  }
  if (response.status !== 0 || response.signal !== null) {
    Errors.ThrowCommandExecution(response)
  }
  const separator = Regxs.HttpHeaderEndRegx.exec(response.stdout)
  if (!separator || code !== 200) {
    Errors.ThrowHostEnvironment(`GitHub Actions run ${runId} returned an unexpected HTTP response.`)
  }
  const body = response.stdout.slice(separator.index + separator[0].length)
  const run = Json.Parse(body, { schema: RunStatusSchema, sourceName: `GitHub Actions run ${runId}` })
  const responseHeaders = response.stdout.slice(0, separator.index)
  return { run, etag: Regxs.HttpETagHeaderRegx.exec(responseHeaders)?.[1]?.trim() ?? '' }
}
