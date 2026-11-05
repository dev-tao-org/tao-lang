import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Errors, Try } from '@shared'
import { Repo } from '@shared/os'
import { Processes } from '@shared/os'
import { registerCommand } from './_command-runner'

/** setupGithubCommand configures and verifies the repository's GitHub HTTPS authentication. */
export default registerCommand({
  name: 'setup-github',
  description: 'Configure GitHub HTTPS authentication and verify access to the repository main branch.',
  async action() {
    await configureHttpsRewrites()
    await authenticateGithub()
    await verifyOrigin()
  },
})

const origin = 'https://github.com/tao-dev-org/tao-lang.git'
const cwd = Repo.getWorkspaceRoot()

async function configureHttpsRewrites(): Promise<void> {
  for (const key of ['url.git@github.com:.insteadOf', 'url.ssh://git@github.com/.insteadOf']) {
    await Try(
      () => CLIKit.runNonInteractiveCommand(`git config --global --unset-all ${key}`, { cwd, stderr: 'ignore' }),
      {
        catch(error) {
          if (!commandFailedWith(error, 5)) {
            Errors.Throw(error)
          }
        },
      },
    )
  }
  for (
    const command of [
      'git config --global --replace-all url.https://github.com/.insteadOf git@github.com:',
      'git config --global --add url.https://github.com/.insteadOf ssh://git@github.com/',
    ]
  ) {
    await CLIKit.runNonInteractiveCommand(command, { cwd })
  }
}

async function authenticateGithub(): Promise<void> {
  const authenticated = await Try(async () => {
    await CLIKit.runNonInteractiveCommand('gh auth status --hostname github.com', {
      cwd,
      stdout: 'ignore',
      stderr: 'ignore',
    })
    return true
  }, {
    catch(error) {
      if (!Errors.isCommandExecutionError(error)) {
        Errors.Throw(error)
      }
      return false
    },
  })
  if (!authenticated) {
    await CLIKit.runInteractiveCommand('gh auth login --hostname github.com --git-protocol https --web', { cwd })
  }
}

async function verifyOrigin(): Promise<void> {
  for (
    const command of [
      'gh config set git_protocol https --host github.com',
      'gh auth setup-git --hostname github.com',
      `git remote set-url origin ${origin}`,
      'git ls-remote --exit-code origin refs/heads/main',
    ]
  ) {
    await CLIKit.runNonInteractiveCommand(command, {
      cwd,
      stdout: command.startsWith('git ls-remote ') ? 'ignore' : 'inherit',
    })
  }
  const remote = await Processes.run('git remote get-url origin', { cwd })
  if (remote.stderr.trim()) {
    IO.warn(remote.stderr.trimEnd())
  }
  IO.print(`GitHub HTTPS authentication is ready for ${remote.stdout.trim()}.`)
}

function commandFailedWith(error: unknown, status: number): boolean {
  return Errors.isCommandExecutionError(error) && error.result.status === status
}
