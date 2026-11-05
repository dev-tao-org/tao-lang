import { Errors, Try } from '../../universal/universal'
import * as Processes from '../Processes'

type CaptureOptions = Processes.RunOptions & { trim?: boolean }

/** capture reads command output and throws when the command fails; trim:false preserves exact text. */
export async function capture(
  command: string,
  options: CaptureOptions = {},
): Promise<string> {
  const result = await Processes.run(command, options)
  return options.trim === false ? result.stdout : result.stdout.trim()
}

/** requireHostProcessAccess rejects restricted execution before starting host-dependent tools.
 *  Process inspection is a conservative prerequisite, not proof of every desktop permission. */
export async function requireHostProcessAccess(
  hint: string,
  inspect = () => capture('ps -axo pid=,ppid='),
): Promise<void> {
  const processes = await Try(inspect, {
    catch(error) {
      Errors.ThrowHostEnvironment(`Host process access is unavailable. ${hint}`, { cause: error })
    },
  })
  if (!processes) {
    Errors.ThrowHostEnvironment(`Host process inspection returned no processes. ${hint}`)
  }
}

/** captureSync reads a synchronous tool probe without requiring the Bun runtime. */
export function captureSync(command: string, options: { variadicArgs?: readonly string[]; cwd?: string } = {}): string {
  return Processes.runSync(command, options).stdout
}
