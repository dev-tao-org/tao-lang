import { Errors, NullCharacter } from '../universal/universal'
import * as FS from './FS'
import * as Path from './Path'

import Exec from './Exec'

/** getWorkspaceRoot locates this checkout from the executing module, independently of the caller's directory. */
export function getWorkspaceRoot(): string {
  if (workspaceRoot) {
    return workspaceRoot
  }
  let directory = Path.dirname(Path.fileURLToPath(import.meta.url))
  while (!FS.existsSync(Path.join(directory, '.git'))) {
    const parent = Path.dirname(directory)
    if (parent === directory) {
      Errors.ThrowHostEnvironment('Cannot find the Git checkout containing the repository tooling.')
    }
    directory = parent
  }
  workspaceRoot = directory
  return workspaceRoot
}

/** getMainWorktreeRoot returns Git's primary worktree, which may differ from the active checkout. */
export function getMainWorktreeRoot(): string {
  if (mainWorktreeRoot) {
    return mainWorktreeRoot
  }
  const { stdout } = Exec.runSync('git', 'worktree list --porcelain -z', { cwd: getWorkspaceRoot() })
  const records = stdout.split(NullCharacter)
  const first = records[0]
  if (!first?.startsWith('worktree ') || records[1] === 'bare') {
    Errors.ThrowHostEnvironment('Git did not report a primary working checkout.')
  }
  mainWorktreeRoot = first.slice('worktree '.length)
  return mainWorktreeRoot
}

/** resolvePath resolves path segments relative to the active checkout. */
export function resolvePath(...segments: string[]): string {
  return Path.resolve(getWorkspaceRoot(), ...segments)
}

type CachedRepositoryRoot = string | undefined
let workspaceRoot: CachedRepositoryRoot
let mainWorktreeRoot: CachedRepositoryRoot
