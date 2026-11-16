import * as CLIKit from '@cli-kit'
import { Env, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

/** setupStorage initializes missing storage unless build-only setup explicitly disables archive access. */
export async function setupStorage(): Promise<void> {
  if (Env.is('TAO_SETUP_STORAGE', 'false')) {
    return
  }
  const cwd = Repo.getWorkspaceRoot()
  const status = await Exec.captureStdout('git', 'submodule status -- .storage', { cwd })
  if (status.startsWith('-')) {
    await CLIKit.runNonInteractiveCommand('git', 'submodule update --init --checkout -- .storage', { cwd })
  }
}
