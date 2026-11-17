import { IO } from '@cli-kit'
import { UserInput } from '@shared'
import { Terminal } from '@shared/os'
import type * as Workspace from '@workspace'

/** workflowUI binds explicit CLI authorization and cancellation to one workflow invocation. */
export function workflowUI(
  yes = false,
  signal?: AbortSignal,
  askConfirm: typeof IO.askConfirm = IO.askConfirm,
): Workspace.WorkflowUI {
  return {
    cancelled: () => signal?.aborted === true,
    async confirm({ entry, message, consumer }) {
      if (yes) {
        return true
      }
      if (!Terminal.isInteractive()) {
        const retry = consumer ? 'Pass --yes' : 'Use tao setup or pass --yes'
        UserInput.fail(`Setup is required for ${entry}: ${message} ${retry} to authorize setup non-interactively.`)
      }
      return await askConfirm({
        message: `${message} Set up dependencies and continue?`,
        defaultValue: true,
        signal,
      })
    },
  }
}
