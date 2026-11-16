import { Errors, Try } from '../../universal/universal'
import { captureStdout } from './Exec'

/** requireHostProcessAccess rejects restricted execution before starting host-dependent tools.
 *  Process inspection is a conservative prerequisite, not proof of every desktop permission. */
export async function requireHostProcessAccess(hint: string): Promise<void> {
  const processes = await Try(() => captureStdout('ps', '-axo pid=,ppid='), {
    catch(error) {
      Errors.ThrowHostEnvironment(`Host process access is unavailable. ${hint}`, { cause: error })
    },
  })
  if (!processes) {
    Errors.ThrowHostEnvironment(`Host process inspection returned no processes. ${hint}`)
  }
}
