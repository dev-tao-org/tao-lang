import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { Terminal } from '@shared/os'

/** confirmDependencyWork asks before preparation can resolve or download dependencies. */
export async function confirmDependencyWork(work: string[], yes: boolean): Promise<void> {
  if (work.length === 0 || yes) {
    return
  }
  const summary = work.join(', ')
  if (!Terminal.isInteractive()) {
    Errors.ThrowUserInput('Dependency setup requires --yes when running non-interactively.')
  }
  if (!await IO.askConfirm({ message: `Set up/download: ${summary}?`, defaultValue: true })) {
    Errors.ThrowUserInput('Dependency preparation was declined; rerun with --yes to proceed non-interactively.')
  }
}
