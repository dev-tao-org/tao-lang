import { Time } from '@shared'
import { Platform } from '@shared/os'

export { type CommandResult, runCapturedCommand, type RunOptions }

/** CommandResult reports captured subprocess output and exit status. */
type CommandResult = { exitCode: number; stderr: string; stdout: string }

/** RunOptions configures cwd, environment, stdin, and timeout for captured commands. */
type RunOptions = {
  args?: readonly string[]
  cwd?: string
  env?: Record<string, EnvironmentValue>
  stdin?: string
  timeoutMs?: number
}

type EnvironmentValue = string | undefined
type ProcessInputMode = 'ignore' | 'pipe'

/** runCapturedCommand runs a subprocess and returns captured stdout, stderr, and exit code. */
async function runCapturedCommand(command: string, options: RunOptions = {}): Promise<CommandResult> {
  const spawnOptions = {
    cwd: options.cwd,
    env: options.env,
    variadicArgs: options.args,
  }
  if (options.stdin !== undefined) {
    const child = Platform.spawnPiped(command, { ...spawnOptions, stdin: 'pipe' })
    child.stdin.write(options.stdin)
    child.stdin.end()
    return await readCommandResult(child, options.timeoutMs)
  }
  const child = Platform.spawnPiped(command, { ...spawnOptions, stdin: 'ignore' })
  return await readCommandResult(child, options.timeoutMs)
}

async function readCommandResult(
  child: ReturnType<typeof Platform.spawnPiped<ProcessInputMode>>,
  timeoutMs?: number,
): Promise<CommandResult> {
  const cancel = timeoutMs === undefined
    ? undefined
    : Time.schedule(timeoutMs, () => {
      void Platform.terminate(child)
    })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  cancel?.()
  return { exitCode, stdout, stderr }
}
