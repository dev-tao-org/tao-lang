import { UserInput } from '@shared'
import type { BunExecutor } from '../sidecars/ManagedModule/ManagedModules'

/** runSidecarTests invokes the pinned Bun test runner from one prepared local module. */
export async function runSidecarTests(moduleRoot: string, executor: BunExecutor): Promise<void> {
  const result = await executor('bun', ['test'], moduleRoot)
  if (result.status !== 0) {
    UserInput.fail(`Sidecar tests failed in ${moduleRoot}. ${result.stderr || result.stdout}`)
  }
}
