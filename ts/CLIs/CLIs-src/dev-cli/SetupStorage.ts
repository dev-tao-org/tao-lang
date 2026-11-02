import { runNonInteractiveCommand } from '@cli-kit'
import { Platform, Repo } from '@shared/os'

/** StorageSetupIO isolates storage inspection and initialization during checkout setup. */
export type StorageSetupIO = {
  status: () => Promise<string>
  initialize: () => Promise<void>
}

/** setupStorage initializes missing storage without changing an existing storage checkout. */
export async function setupStorage(io: StorageSetupIO = storageSetupIO()): Promise<void> {
  if ((await io.status()).startsWith('-')) {
    await io.initialize()
  }
}
function storageSetupIO(): StorageSetupIO {
  const cwd = Repo.getWorkspaceRoot()
  return {
    status: () => Platform.capture('git submodule status -- .storage', { cwd }),
    async initialize() {
      await runNonInteractiveCommand('git submodule update --init --checkout -- .storage', { cwd })
    },
  }
}
