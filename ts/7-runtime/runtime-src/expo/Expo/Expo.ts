import { Errors, NewlineCharacter, Try } from '@shared'
import { Env, HttpServer, Path } from '@shared/os'
import Exec, { type ProcessOutput } from '@shared/os/exec'
import { Addr, Http } from '@shared/web'
import { HeadlessExpoEnvironment } from '../../bridges/Bridge_expo/Bridge_expo-config'
import type { RuntimeApplication } from '../../Runtime'
import type { GeneratedRevision, PublicationOutcome } from '../PreviewProtocol'
import { type ExpoGeneratedOptions, prepareExpoPublication } from './ExpoPublication'
import { waitForExpoReady } from './ExpoReadiness'

type ExpoApplicationField = 'directory' | 'metroPreloadPath'
type ExpoApplication = Pick<RuntimeApplication, ExpoApplicationField>
/** createExpoSession starts a managed Expo server and waits for its first response. */
export async function createExpoSession(
  application: ExpoApplication,
  options: ExpoOptions = {},
): Promise<ExpoSession> {
  const port = unusedPort()
  const publication = await prepareExpoPublication(application, options.generated)
  const platform = options.platform ?? 'web'
  const addEnv = createExpoEnvironment(application.directory, publication.environment, platform)
  const child = Exec.spawn('expo', expoStartArguments(platform, port), {
    cwd: application.directory,
    addEnv,
  })
  const url = Addr.localhostUrl(port)
  const readinessUrl = platform === 'web' ? url : url + '/status'
  const output = Exec.captureProcessOutput(child, options.onOutput)
  await Try(() => waitForExpoReady(readinessUrl, () => child.exitCode === null, undefined, undefined, options.signal), {
    async catch(error) {
      await Exec.stopProcess(child)
      Errors.ThrowHostEnvironment(`Expo ${platform} failed to start. ${formatOutput(await output)} ${String(error)}`)
    },
  })
  return {
    url,
    sessionId: publication.sessionId,
    publish: revision => publication.publish(url, revision),
    output: () => output,
    async dispose() {
      publication.dispose()
      await Exec.stopProcess(child)
      await output
    },
  }
}

/** ExpoSession describes the live server and its retained process output. */
export type ExpoSession = {
  url: string
  sessionId: string
  publish(revision: GeneratedRevision): Promise<PublicationOutcome>
  output(): Promise<ProcessOutput>
  dispose(): Promise<void>
}

/** ExpoOptions streams Expo output while retaining a copy for diagnostics. */
export type ExpoOptions = {
  onOutput?: (stream: OutputStream, text: string) => void
  signal?: AbortSignal
  generated?: ExpoGeneratedOptions
  platform?: ExpoPlatform
}

/** ExpoPlatform identifies the device family served by a generated Expo session. */
export type ExpoPlatform = 'web' | 'ios' | 'android'

function expoStartArguments(platform: ExpoPlatform, port: number): string[] {
  const target = platform === 'web' ? ['--web'] : ['--go', '--localhost', '--no-dev']
  return ['start', ...target, '--port', String(port), '--max-workers', '1']
}

type OptionalEnvironmentValue = string | undefined
type ExpoProcessEnvironment = Record<string, OptionalEnvironmentValue>
function createExpoEnvironment(
  directory: string,
  publicationEnvironment: ExpoProcessEnvironment,
  platform: ExpoPlatform,
): ExpoProcessEnvironment {
  const environment = { ...expoEnvironment(directory), ...publicationEnvironment }
  if (platform !== 'web') {
    // Expo binds --localhost through Node DNS, while devices connect through IPv4 loopback.
    const nodeOptions = environment['NODE_OPTIONS'] ?? Env.get('NODE_OPTIONS') ?? ''
    environment['NODE_OPTIONS'] = (nodeOptions + ' --dns-result-order=ipv4first').trim()
  }
  return environment
}

function expoEnvironment(directory: string): ExpoProcessEnvironment {
  return {
    ...HeadlessExpoEnvironment,
    PATH: Path.join(directory, 'node_modules/.bin') + Path.delimiter + (Env.get('PATH') ?? ''),
    BROWSER: 'none',
    CI: 'false',
    EXPO_OFFLINE: '1',
    EXPO_NO_TELEMETRY: '1',
    EXPO_NO_TYPESCRIPT_SETUP: '1',
  }
}

function unusedPort(): number {
  const server = HttpServer.serve({
    hostname: Addr.Localhost,
    port: 0,
    fetch: () => Http.response(),
  })
  const port = server.port ?? Errors.ThrowShouldNeverHappen('Could not reserve a local Expo port.')
  server.stop(true)
  return port
}

function formatOutput(output: ProcessOutput): string {
  const messages = [output.stdout.trim(), output.stderr.trim()].filter(Boolean)
  return messages.length ? `Expo output:${NewlineCharacter}${messages.join(NewlineCharacter)}` : ''
}

type OutputStream = 'stdout' | 'stderr'
