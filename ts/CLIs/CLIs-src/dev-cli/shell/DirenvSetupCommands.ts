import Exec from '@shared/os/exec'
import type { CaptureOptions, Command, CommandArgs, CommandResult as ExecCommandResult } from '@shared/os/exec'

type CommandResultField = 'status' | 'stdout' | 'stderr'
/** CommandResult exposes captured setup output and process status. */
export type CommandResult = Pick<ExecCommandResult<number>, CommandResultField>
/** RunOptions configures setup command environment, input, and timeout. */
export type RunOptions = Omit<CaptureOptions, 'check'>

/** runCapturedCommand executes a setup command while preserving its complete process outcome. */
export async function runCapturedCommand(
  command: Command,
  args: CommandArgs = [],
  options: RunOptions = {},
): Promise<CommandResult> {
  const result = await Exec.capture(command, args, { ...options, check: false })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
