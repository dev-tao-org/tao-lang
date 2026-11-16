import { Time, Try } from '../../universal/universal'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import * as BunHost from '../bridges/Bridge_bun/Bridge_bun'

/** ManagedProcess is an Expo-like child with piped output streams. */
export type ManagedProcess = BunHost.Subprocess<'ignore', 'pipe', 'pipe'>

/** stopProcess asks a managed child to stop, then force-stops it after a bounded grace period. */
export async function stopProcess(child: BunHost.Subprocess, graceMs = 3000): Promise<void> {
  if (child.exitCode !== null) {
    return
  }
  child.kill('SIGINT')
  const cancel = Time.schedule(graceMs, () => child.exitCode === null && child.kill('SIGKILL'))
  await Try(() => child.exited, { finally: cancel })
}

/** ProcessOutput retains both piped child streams for later failure diagnostics. */
export type ProcessOutput = { stdout: string; stderr: string }

/** captureProcessOutput drains both pipes, buffers their contents, and streams chunks to a listener. */
export async function captureProcessOutput(
  child: ManagedProcess,
  onOutput?: OutputListener,
): Promise<ProcessOutput> {
  const [stdout, stderr] = await Promise.all([
    readOutput(child.stdout, 'stdout', onOutput),
    readOutput(child.stderr, 'stderr', onOutput),
  ])
  return { stdout, stderr }
}

type ProcessOutputName = 'stdout' | 'stderr'
type ProcessOutputStream = WebHost.ReadableStream<Uint8Array> | null
type OutputListener = (stream: ProcessOutputName, text: string) => void

async function readOutput(
  stream: ProcessOutputStream,
  name: ProcessOutputName,
  onOutput?: OutputListener,
): Promise<string> {
  if (!stream) {
    return ''
  }
  const reader = stream.getReader()
  const decoder = new WebHost.TextDecoder()
  let output = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      const remaining = decoder.decode()
      output += remaining
      if (remaining) {
        onOutput?.(name, remaining)
      }
      return output
    }
    const text = decoder.decode(chunk.value, { stream: true })
    output += text
    if (text) {
      onOutput?.(name, text)
    }
  }
}
