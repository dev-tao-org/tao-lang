import { Errors, Time, Try } from '@shared'
import { Env, Platform } from '@shared/os'
import * as Http from '../../shared/shared-src/os/Http'
import * as Lifecycle from '../../shared/shared-src/os/ProcessLifecycle'
import type { Project } from './Project'

/** createExpoSession starts a managed Expo web server and waits for its first response. */
export async function createExpoSession(project: Project, options: ExpoOptions = {}): Promise<ExpoSession> {
  const port = unusedPort()
  const child = Platform.spawn('expo', {
    variadicArgs: ['start', '--web', '--port', String(port), '--max-workers', '1'],
    cwd: project.expoDirectory,
    env: expoEnvironment(),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const url = `http://127.0.0.1:${port}`
  const output = Lifecycle.captureProcessOutput(child, options.onOutput)
  await Try(() => waitForReady(url, child), {
    async catch(error) {
      await Lifecycle.stopProcess(child)
      Errors.ThrowHostEnvironment(`Expo web preview failed to start. ${formatOutput(await output)} ${String(error)}`)
    },
  })
  return {
    url,
    output() {
      return output
    },
    async dispose() {
      await Lifecycle.stopProcess(child)
      await output
    },
  }
}

/** ExpoSession describes the live server and its retained process output. */
export type ExpoSession = {
  url: string
  output(): Promise<Lifecycle.ProcessOutput>
  dispose(): Promise<void>
}

/** ExpoOptions streams Expo output while retaining a copy for diagnostics. */
export type ExpoOptions = { onOutput?: (stream: 'stdout' | 'stderr', text: string) => void }

function unusedPort(): number {
  const server = Http.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return Http.response()
    },
  })
  const port = server.port ?? Errors.ThrowUnexpected('Could not reserve a local Expo port.')
  server.stop(true)
  return port
}

function expoEnvironment(): Record<string, string | undefined> {
  return {
    ...Env.snapshot(),
    BROWSER: 'none',
    CI: 'false',
    EXPO_OFFLINE: '1',
    EXPO_NO_TELEMETRY: '1',
  }
}

async function waitForReady(
  url: string,
  child: Lifecycle.ManagedProcess,
): Promise<void> {
  const deadline = Time.nowMs() + 90_000
  while (Time.nowMs() < deadline) {
    if (child.exitCode !== null) {
      Errors.ThrowHostEnvironment('Expo exited before becoming ready.')
    }
    const response = await Try(() => Http.request(url), {
      catch() {
        return undefined
      },
    })
    if (response?.ok) {
      return
    }
    await Time.sleep(250)
  }
  Errors.ThrowHostEnvironment('Expo did not become ready within 90 seconds.')
}

function formatOutput(output: Lifecycle.ProcessOutput): string {
  const messages = [output.stdout.trim(), output.stderr.trim()].filter(Boolean)
  return messages.length ? `Expo output:\n${messages.join('\n')}` : ''
}
