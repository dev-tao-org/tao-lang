import { IO } from '@cli-kit'
import { FS, Path, Repo } from '@shared/os'
import Exec, { type Command, type CommandArgs, type CommandOptions } from '@shared/os/exec'
import { dispatchVerify } from '../commands/VerifyDispatch'

/** LandingIO scopes landing commands and file operations to the selected checkout. */
export type LandingIO = {
  root: string
  command: (command: Command, args?: CommandArgs, options?: CommandOptions) => Promise<string>
  verifyHostedIos: (branch: string, head: string) => Promise<void>
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  write: (path: string, text: string) => Promise<void>
}

/** createLandingIO binds the landing boundary to the active checkout and managed tools. */
export function createLandingIO(): LandingIO {
  const root = Repo.getWorkspaceRoot()
  return {
    root,
    command(command, args = [], options = {}) {
      const argv = Exec.resolveCommandArgs(args)
      const progress = commandProgress(command, argv)
      if (progress) {
        IO.progress(progress)
      }
      const { cwd = root, addEnv } = options
      return Exec.captureStdout(command, argv, { cwd, addEnv, trim: false })
    },
    verifyHostedIos: (branch, head) => dispatchVerify(root, branch, head, { withIos: true, wait: true }),
    read: path => FS.readFile(Path.resolve(root, path), 'utf8'),
    exists: path => FS.exists(Path.resolve(root, path)),
    async write(path, text) {
      const destination = Path.resolve(root, path)
      await FS.mkdir(Path.dirname(destination))
      await FS.writeFile(destination, text)
    },
  }
}

type GitOptions = { storage?: boolean; trim?: boolean }

/** git runs literal arguments in the selected repository; trim:false preserves exact output bytes. */
export async function git(io: LandingIO, args: readonly string[], options: GitOptions = {}): Promise<string> {
  const directory = options.storage ? Path.join(io.root, '.storage') : io.root
  const output = await io.command('git', args, { cwd: directory })
  return options.trim === false ? output : output.trim()
}

function commandProgress(command: string, args: readonly string[]): string | undefined {
  const stages: LandingCommandMessages = {
    './agent verify': 'Verifying the reviewed source…',
    'git fetch': 'Fetching remote history…',
    'git push': 'Publishing the pinned commit…',
    'git merge': 'Integrating fetched history…',
    'git submodule': 'Preparing the storage archive…',
    'git ls-remote': 'Confirming remote archive identity…',
    'gh pr list': 'Checking pull request state…',
    'gh pr create': 'Opening the reviewed pull request…',
    'gh pr edit': 'Updating the reviewed pull request…',
    'gh pr checks': 'Waiting for required checks on the pinned source…',
    'gh pr merge': 'Requesting the pinned squash merge…',
    'gh api': 'Confirming the merge on remote main…',
  }
  const [subcommand, action] = args
  return stages[`${command} ${subcommand} ${action}`] ?? stages[`${command} ${subcommand}`]
}

type LandingCommandMessages = Record<string, string>
