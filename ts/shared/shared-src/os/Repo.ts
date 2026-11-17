import { Errors, NullCharacter } from '../universal/universal'
import * as UserInput from '../universal/UserInput'
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

/** assertNewWorkspacePath confines requested paths to the selected root and excludes the reference implementation. */
export function assertNewWorkspacePath(path: string, root = getWorkspaceRoot()): void {
  const absolute = Path.resolve(path)
  let existing = absolute
  while (!FS.existsSync(existing)) {
    const parent = Path.dirname(existing)
    if (parent === existing) {
      break
    }
    existing = parent
  }
  const canonical = FS.realpathSync(existing)
  const legacyRoot = resolvePath('.x-tao-old-v1')
  const legacy = FS.existsSync(legacyRoot) ? FS.realpathSync(legacyRoot) : legacyRoot
  UserInput.require(
    !(Path.isWithin(legacyRoot, absolute) || Path.isWithin(legacy, canonical)),
    'Run legacy workflows from .x-tao-old-v1/; root commands target the new implementation.',
  )
  const canonicalRoot = FS.realpathSync(root)
  if (!Path.isWithin(root, absolute) || !Path.isWithin(canonicalRoot, canonical)) {
    UserInput.fail(`Requested paths must remain inside ${root}: ${path}`)
  }
}

type CachedRepositoryRoot = string | undefined
let workspaceRoot: CachedRepositoryRoot
let mainWorktreeRoot: CachedRepositoryRoot
