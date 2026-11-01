import { IO } from '@cli-kit'
import { FileSystem, Path, Platform, Repo } from '@shared/os'

/** LandingIO isolates command and file effects so workflow tests never launch Git or GitHub. */
export type LandingIO = {
  root: string
  command: (command: string, args?: readonly string[], directory?: string) => Promise<string>
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
  write: (path: string, text: string) => Promise<void>
}

/** createLandingIO binds the landing boundary to the active checkout and managed tools. */
export function createLandingIO(): LandingIO {
  const root = Repo.getWorkspaceRoot()
  return {
    root,
    command(command, args = [], directory = root) {
      const progress = commandProgress(command, args)
      if (progress) {
        IO.progress(progress)
      }
      return Platform.capture(command, { variadicArgs: args, cwd: directory, trim: false })
    },
    read: path => FileSystem.readFile(Path.resolve(root, path), 'utf8'),
    exists: path => FileSystem.exists(Path.resolve(root, path)),
    async write(path, text) {
      const destination = Path.resolve(root, path)
      await FileSystem.mkdir(Path.dirname(destination))
      await FileSystem.writeFile(destination, text)
    },
  }
}

/** git reads or mutates the selected repository using literal arguments. */
export async function git(io: LandingIO, args: readonly string[], storage = false): Promise<string> {
  return (await io.command('git', args, storage ? Path.join(io.root, '.storage') : io.root)).trim()
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
  return stages[command] ?? stages[`${command} ${args[0]}`]
}

type LandingCommandMessages = Record<string, string>
