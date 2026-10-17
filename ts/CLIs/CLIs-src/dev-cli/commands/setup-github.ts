import { IO, runCommand } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Platform, Repo } from '@shared/os'
import { registerCommand } from './_command-runner'

const origin = 'https://github.com/tao-dev-org/tao-lang.git'
const cwd = Repo.getWorkspaceRoot()

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

async function configureHttpsRewrites(): Promise<void> {
  for (const key of ['url.git@github.com:.insteadOf', 'url.ssh://git@github.com/.insteadOf']) {
    await Try(() => runCommand(`git config --global --unset-all ${key}`, { cwd, stderr: 'ignore' }), {
      catch(error) {
        if (!commandFailedWith(error, 5)) {
          Errors.Throw(error)
        }
      },
    })
  }
  for (
    const command of [
      'git config --global --replace-all url.https://github.com/.insteadOf git@github.com:',
      'git config --global --add url.https://github.com/.insteadOf ssh://git@github.com/',
    ]
  ) {
    await runCommand(command, { cwd })
  }
}

async function authenticateGithub(): Promise<void> {
  const authenticated = await Try(async () => {
    await runCommand('gh auth status --hostname github.com', { cwd, stdout: 'ignore', stderr: 'ignore' })
    return true
  }, {
    catch(error) {
      if (!Errors.isTaoError(error) || error.name !== 'CommandExecutionError') {
        Errors.Throw(error)
      }
      return false
    },
  })
  if (!authenticated) {
    await runCommand('gh auth login --hostname github.com --git-protocol https --web', { cwd })
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
    await runCommand(command, { cwd, stdout: command.startsWith('git ls-remote ') ? 'ignore' : 'inherit' })
  }
  const remote = Platform.spawn('git remote get-url origin', { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [code, url, stderr] = await Promise.all([
    remote.exited,
    Platform.readText(remote.stdout),
    Platform.readText(remote.stderr),
  ])
  IO.stderr(stderr)
  if (code !== 0) {
    Errors.ThrowCommandExecution({
      command: 'git',
      args: ['remote', 'get-url', 'origin'],
      cwd,
      status: code,
      signal: remote.signalCode,
      stdout: url,
      stderr,
    })
  }
  IO.debug(`GitHub HTTPS authentication is ready for ${url.trim()}.`)
}

function commandFailedWith(error: unknown, status: number): boolean {
  return Errors.isTaoError(error) && error.name === 'CommandExecutionError' && error.result.status === status
}
