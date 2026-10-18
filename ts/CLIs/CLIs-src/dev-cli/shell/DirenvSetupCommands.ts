import { Platform } from '@shared/os'

/** CommandResult reports captured subprocess output and exit status. */
export type CommandResult = { exitCode: number; stderr: string; stdout: string }

/** RunOptions configures cwd, environment, stdin, and timeout for captured commands. */
export type RunOptions = {
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  stdin?: string
  timeoutMs?: number
}

/** runCapturedCommand runs a subprocess and returns captured stdout, stderr, and exit code. */
async function runCapturedCommand(command: string, options: RunOptions = {}): Promise<CommandResult> {
  const spawnOptions = {
    cwd: options.cwd,
    env: options.env,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    variadicArgs: options.args,
  }
  if (options.stdin !== undefined) {
    const child = Platform.spawn(command, { ...spawnOptions, stdin: 'pipe' })
    child.stdin.write(options.stdin)
    child.stdin.end()
    return await readCommandResult(child, options.timeoutMs)
  }
  const child = Platform.spawn(command, { ...spawnOptions, stdin: 'ignore' })
  return await readCommandResult(child, options.timeoutMs)
}

async function readCommandResult(
  child: ReturnType<typeof Platform.spawn<'ignore' | 'pipe', 'pipe', 'pipe'>>,
  timeoutMs?: number,
): Promise<CommandResult> {
  const cancel = timeoutMs === undefined
    ? undefined
    : Platform.scheduleDelayed(timeoutMs, () => {
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

export { runCapturedCommand }
