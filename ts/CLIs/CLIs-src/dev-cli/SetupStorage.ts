import * as CLIKit from '@cli-kit'
import { Env, Repo } from '@shared/os'
import { Exec } from '@shared/os'

/** StorageSetupIO isolates storage inspection and initialization during checkout setup. */
export type StorageSetupIO = {
  status: () => Promise<string>
  initialize: () => Promise<void>
}

/** setupStorage initializes missing storage unless build-only setup explicitly disables archive access. */
export async function setupStorage(io: StorageSetupIO = storageSetupIO()): Promise<void> {
  if (Env.is('TAO_SETUP_STORAGE', 'false')) {
    return
  }
  if ((await io.status()).startsWith('-')) {
    await io.initialize()
  }
}
function storageSetupIO(): StorageSetupIO {
  const cwd = Repo.getWorkspaceRoot()
  return {
    status: () => Exec.captureStdout('git', 'submodule status -- .storage', { cwd }),
    async initialize() {
      await CLIKit.runNonInteractiveCommand('git submodule update --init --checkout -- .storage', { cwd })
    },
  }
}
