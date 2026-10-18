import { Time, Try } from '../universal/universal'

/** waitForTermination resolves once the process receives an interactive shutdown signal. */
export function waitForTermination(): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      process.off('SIGINT', finish)
      process.off('SIGTERM', finish)
      resolve()
    }
    process.once('SIGINT', finish)
    process.once('SIGTERM', finish)
  })
}

/** ManagedProcess is an Expo-like child with piped output streams. */
export type ManagedProcess = Bun.Subprocess<'ignore', 'pipe', 'pipe'>

/** stopProcess asks a managed child to stop, then force-stops it after a bounded grace period. */
export async function stopProcess(child: ManagedProcess): Promise<void> {
  if (child.exitCode !== null) {
    return
  }
  child.kill('SIGINT')
  const cancel = Time.schedule(3000, () => child.exitCode === null && child.kill('SIGKILL'))
  await Try(() => child.exited, { finally: cancel })
}

/** ProcessOutput retains both piped child streams for later failure diagnostics. */
export type ProcessOutput = { stdout: string; stderr: string }

/** captureProcessOutput drains both pipes, buffers their contents, and streams chunks to a listener. */
export async function captureProcessOutput(
  child: ManagedProcess,
  onOutput?: (stream: 'stdout' | 'stderr', text: string) => void,
): Promise<ProcessOutput> {
  const [stdout, stderr] = await Promise.all([
    readOutput(child.stdout, 'stdout', onOutput),
    readOutput(child.stderr, 'stderr', onOutput),
  ])
  return { stdout, stderr }
}

async function readOutput(
  stream: ReadableStream<Uint8Array> | null,
  name: 'stdout' | 'stderr',
  onOutput?: (stream: 'stdout' | 'stderr', text: string) => void,
): Promise<string> {
  if (!stream) {
    return ''
  }
  const reader = stream.getReader()
  const decoder = new TextDecoder()
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
