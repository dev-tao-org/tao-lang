import { IO, runCommand } from '@cli-kit'
import { registerCommand, repositoryRoot as cwd } from './_command-runner'

const origin = 'https://github.com/tao-dev-org/tao-lang.git'

/** setupGithubCommand configures and verifies the repository's GitHub HTTPS authentication. */
export default registerCommand({
  name: 'setup-github',
  description: 'Configure GitHub HTTPS authentication and verify access to the repository main branch.',
  action: async () => {
    for (const key of ['url.git@github.com:.insteadOf', 'url.ssh://git@github.com/.insteadOf']) {
      await runCommand(['git', 'config', '--global', '--unset-all', key], { cwd, stderr: 'ignore' })
    }
    for (
      const args of [
        ['--replace-all', 'url.https://github.com/.insteadOf', 'git@github.com:'],
        ['--add', 'url.https://github.com/.insteadOf', 'ssh://git@github.com/'],
      ]
    ) {
      const code = await runCommand(['git', 'config', '--global', ...args], { cwd })
      if (code !== 0) {
        return code
      }
    }
    const authenticated = await runCommand(['gh', 'auth', 'status', '--hostname', 'github.com'], {
      cwd,
      stdout: 'ignore',
      stderr: 'ignore',
    })
    if (authenticated !== 0) {
      const code = await runCommand([
        'gh',
        'auth',
        'login',
        '--hostname',
        'github.com',
        '--git-protocol',
        'https',
        '--web',
      ], { cwd })
      if (code !== 0) {
        return code
      }
    }
    for (
      const args of [
        ['gh', 'config', 'set', 'git_protocol', 'https', '--host', 'github.com'],
        ['gh', 'auth', 'setup-git', '--hostname', 'github.com'],
        ['git', 'remote', 'set-url', 'origin', origin],
        ['git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/main'],
      ]
    ) {
      const code = await runCommand(args, { cwd, stdout: args[1] === 'ls-remote' ? 'ignore' : 'inherit' })
      if (code !== 0) {
        return code
      }
    }
    const remote = Bun.spawn(['git', 'remote', 'get-url', 'origin'], { cwd, stdout: 'pipe', stderr: 'pipe' })
    const [code, url, stderr] = await Promise.all([
      remote.exited,
      new Response(remote.stdout).text(),
      new Response(remote.stderr).text(),
    ])
    IO.stderr(stderr)
    if (code !== 0) {
      return code
    }
    IO.debug(`GitHub HTTPS authentication is ready for ${url.trim()}.`)
  },
})
