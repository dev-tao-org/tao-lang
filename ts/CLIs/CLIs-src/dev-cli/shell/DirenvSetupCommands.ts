import { Platform } from '@shared/os'

export { runCapturedCommand }
type CommandResultField = 'status' | 'stdout' | 'stderr'
/** CommandResult exposes captured setup output and process status. */
export type CommandResult = Pick<Platform.AsyncCommandResult, CommandResultField>
/** RunOptions configures setup command arguments, environment, input, and timeout. */
export type RunOptions = {
  args?: readonly string[]
  cwd?: string
  addEnv?: Record<string, EnvironmentValue>
  stdin?: string
  timeoutMs?: number
}

type EnvironmentValue = string | undefined

/** runCapturedCommand executes a setup command while preserving its complete process outcome. */
async function runCapturedCommand(command: string, options: RunOptions = {}): Promise<CommandResult> {
  const result = await Platform.runIgnoreStatus(command, {
    variadicArgs: options.args,
    cwd: options.cwd,
    addEnv: options.addEnv,
    stdin: options.stdin,
    timeoutMs: options.timeoutMs,
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
