import { Errors, Try } from '@shared'
import { Env, Http, Lifecycle, Path, Platform } from '@shared/os'
import type { RuntimeApplication } from '../Runtime'
import { type ExpoGeneratedOptions, prepareExpoPublication } from './ExpoPublication'
import { waitForExpoReady } from './ExpoReadiness'
import type { GeneratedRevision, PublicationOutcome } from './PreviewProtocol'

/** createExpoSession starts a managed Expo web server and waits for its first response. */
export async function createExpoSession(
  application: RuntimeApplication,
  options: ExpoOptions = {},
): Promise<ExpoSession> {
  const port = unusedPort()
  const publication = await prepareExpoPublication(application, options.generated)
  const child = Platform.spawn('expo', {
    variadicArgs: ['start', '--web', '--port', String(port), '--max-workers', '1'],
    cwd: application.directory,
    env: { ...expoEnvironment(application.directory), ...publication.environment },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const url = `http://127.0.0.1:${port}`
  const output = Lifecycle.captureProcessOutput(child, options.onOutput)
  await Try(() => waitForExpoReady(url, () => child.exitCode === null, undefined, undefined, options.signal), {
    async catch(error) {
      await Lifecycle.stopProcess(child)
      Errors.ThrowHostEnvironment(`Expo web preview failed to start. ${formatOutput(await output)} ${String(error)}`)
    },
  })
  return {
    url,
    sessionId: publication.sessionId,
    publish: revision => publication.publish(url, revision),
    output: () => output,
    async dispose() {
      publication.dispose()
      await Lifecycle.stopProcess(child)
      await output
    },
  }
}

/** ExpoSession describes the live server and its retained process output. */
export type ExpoSession = {
  url: string
  sessionId: string
  publish(revision: GeneratedRevision): Promise<PublicationOutcome>
  output(): Promise<Lifecycle.ProcessOutput>
  dispose(): Promise<void>
}

/** ExpoOptions streams Expo output while retaining a copy for diagnostics. */
export type ExpoOptions = {
  onOutput?: (stream: OutputStream, text: string) => void
  signal?: AbortSignal
  generated?: ExpoGeneratedOptions
}

type OptionalEnvironmentValue = string | undefined
function expoEnvironment(directory: string): Record<string, OptionalEnvironmentValue> {
  return {
    ...Env.snapshot(),
    PATH: Path.join(directory, 'node_modules/.bin') + Path.delimiter + (Env.get('PATH') ?? ''),
    BROWSER: 'none',
    CI: 'false',
    EXPO_UNSTABLE_HEADLESS: '1',
    EXPO_OFFLINE: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_NO_TYPESCRIPT_SETUP: '1',
  }
}

function unusedPort(): number {
  const server = Http.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Http.response(),
  })
  const port = server.port ?? Errors.ThrowShouldNeverHappen('Could not reserve a local Expo port.')
  server.stop(true)
  return port
}

function formatOutput(output: Lifecycle.ProcessOutput): string {
  const messages = [output.stdout.trim(), output.stderr.trim()].filter(Boolean)
  return messages.length ? `Expo output:\n${messages.join('\n')}` : ''
}

type OutputStream = 'stdout' | 'stderr'
