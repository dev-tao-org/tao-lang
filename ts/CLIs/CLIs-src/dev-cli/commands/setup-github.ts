import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Errors, Try } from '@shared'
import { Repo } from '@shared/os'
import Exec from '@shared/os/exec'
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
      () =>
        CLIKit.runNonInteractiveCommand('git', ['config', '--global', '--unset-all', key], { cwd, stderr: 'ignore' }),
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
    const args of [
      'config --global --replace-all url.https://github.com/.insteadOf git@github.com:',
      'config --global --add url.https://github.com/.insteadOf ssh://git@github.com/',
    ]
  ) {
    await CLIKit.runNonInteractiveCommand('git', args, { cwd })
  }
}

async function authenticateGithub(): Promise<void> {
  const authenticated = await Try(async () => {
    await CLIKit.runNonInteractiveCommand('gh', 'auth status --hostname github.com', {
      cwd,
      stdout: 'ignore',
      stderr: 'ignore',
    })
    return true
  }, {
    catch(error) {
      if (!commandFailedWith(error, 1)) {
        Errors.Throw(error)
      }
      return false
    },
  })
  if (!authenticated) {
    await CLIKit.runInteractiveCommand('gh', 'auth login --hostname github.com --git-protocol https --web', { cwd })
  }
}

async function verifyOrigin(): Promise<void> {
  await CLIKit.runNonInteractiveCommand('gh', 'config set git_protocol https --host github.com', { cwd })
  await CLIKit.runNonInteractiveCommand('gh', 'auth setup-git --hostname github.com', { cwd })
  await CLIKit.runNonInteractiveCommand('git', ['remote', 'set-url', 'origin', origin], { cwd })
  await CLIKit.runNonInteractiveCommand('git', 'ls-remote --exit-code origin refs/heads/main', {
    cwd,
    stdout: 'ignore',
  })
  const remote = await Exec.capture('git', 'remote get-url origin', { cwd })
  if (remote.stderr.trim()) {
    IO.warn(remote.stderr.trimEnd())
  }
  IO.print(`GitHub HTTPS authentication is ready for ${remote.stdout.trim()}.`)
}

function commandFailedWith(error: unknown, status: number): boolean {
  if (!Errors.isCommandExecutionError(error)) {
    return false
  }
  return error.result.status === status && error.result.signal === null
}
