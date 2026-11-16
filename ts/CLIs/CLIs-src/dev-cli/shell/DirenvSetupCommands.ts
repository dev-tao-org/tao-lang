import { Exec } from '@shared/os'

type CommandResultField = 'status' | 'stdout' | 'stderr'
/** CommandResult exposes captured setup output and process status. */
export type CommandResult = Pick<Exec.CommandResult<number>, CommandResultField>
/** RunOptions configures setup command environment, input, and timeout. */
export type RunOptions = Omit<Exec.CaptureOptions, 'check'>

/** runCapturedCommand executes a setup command while preserving its complete process outcome. */
export async function runCapturedCommand(
  command: Exec.Command,
  args: Exec.CommandArgs = [],
  options: RunOptions = {},
): Promise<CommandResult> {
  const result = await Exec.capture(command, args, { ...options, check: false })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
