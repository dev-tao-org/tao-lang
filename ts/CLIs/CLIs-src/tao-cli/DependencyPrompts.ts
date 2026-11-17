import { IO } from '@cli-kit'
import { UserInput } from '@shared'
import { Terminal } from '@shared/os'

/** confirmDependencyWork asks before preparation can resolve or download dependencies. */
export async function confirmDependencyWork(work: string[], yes: boolean): Promise<void> {
  if (work.length === 0 || yes) {
    return
  }
  const summary = work.join(', ')
  UserInput.require(!!Terminal.isInteractive(), 'Dependency setup requires --yes when running non-interactively.')
  UserInput.require(
    !!(await IO.askConfirm({ message: `Set up/download: ${summary}?`, defaultValue: true })),
    'Dependency preparation was declined; rerun with --yes to proceed non-interactively.',
  )
}
