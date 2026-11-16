import { IO } from '@cli-kit'
import { Errors } from '@shared'
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
    async confirm({ entry, message }) {
      if (yes) {
        return true
      }
      if (!Terminal.isInteractive()) {
        Errors.ThrowUserInput(
          `Setup is required for ${entry}: ${message} Use tao setup or pass --yes to authorize setup non-interactively.`,
        )
      }
      return await askConfirm({
        message: `${message} Set up dependencies and continue?`,
        defaultValue: true,
        signal,
      })
    },
  }
}
