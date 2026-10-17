import { Errors, Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

type Result = { code: number; stdout: string; stderr: string }
type Fixture = {
  root: string
  git: (...args: string[]) => Promise<Result>
  setup: (entry: 'just' | 'dev' | 'agent', env?: Record<string, string>) => Promise<Result>
}

async function withFixture(work: (fixture: Fixture) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tao-github-setup-'))
  await Try(async () => {
    const root = join(directory, 'checkout')
    const bin = join(directory, 'bin')
    const remote = join(directory, 'remote.git')
    const repository = fileURLToPath(new URL('../../../../', import.meta.url))
    await mkdir(join(root, 'ts'), { recursive: true })
    await mkdir(bin)
    for (
      const entry of ['agent', 'dev', 'Justfile', 'ts/CLIs', 'ts/shared', 'ts/tsconfig.json', 'ts/tsconfig.base.json']
    ) {
      await cp(join(repository, entry), join(root, entry), { recursive: true })
    }
    await symlink(join(repository, 'ts/node_modules'), join(root, 'ts/node_modules'))
    const env = {
      ...process.env,
      HOME: directory,
      PATH: `${bin}:${process.env.PATH}`,
      GIT_CONFIG_GLOBAL: join(directory, 'gitconfig'),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_COUNT: '0',
      GH_CONFIG_DIR: join(directory, 'gh'),
      TAO_SETUP_GITHUB_GIT: Bun.which('git')!,
      TAO_SETUP_GITHUB_BUN: process.execPath,
      TAO_SETUP_GITHUB_REMOTE: remote,
      TAO_SETUP_GITHUB_CALLS: join(root, 'gh-calls'),
    }
    const scripts = {
      git: `#!/bin/sh
if [ "$1" = ls-remote ]; then
  [ "$2" = --exit-code ] && [ "$3" = origin ] && [ "$4" = refs/heads/main ] || exit 64
  exec "$TAO_SETUP_GITHUB_GIT" ls-remote --exit-code "$TAO_SETUP_GITHUB_REMOTE" refs/heads/main
fi
exec "$TAO_SETUP_GITHUB_GIT" "$@"
`,
      gh: `#!/bin/sh
printf '%s\\n' "$*" >> "$TAO_SETUP_GITHUB_CALLS"
case "$1 $2" in
  'auth status') echo 'auth status diagnostics'; echo 'auth status diagnostics' >&2; exit "\${TAO_SETUP_GITHUB_AUTH_STATUS:-0}" ;;
  'auth login') exit "\${TAO_SETUP_GITHUB_LOGIN_EXIT:-0}" ;;
  'auth setup-git') exit "\${TAO_SETUP_GITHUB_HELPER_EXIT:-0}" ;;
  'config set') exit 0 ;;
  *) exit 64 ;;
esac
`,
      bun: `#!/bin/sh
case "$*" in
  *commands/_setup.ts*github*) echo 'GitHub setup incorrectly reached dependency installation' >&2; exit 71 ;;
esac
exec "$TAO_SETUP_GITHUB_BUN" "$@"
`,
    }
    for (const [name, body] of Object.entries(scripts)) {
      await Bun.write(join(bin, name), body)
      await chmod(join(bin, name), 0o755)
    }
    const capture = async (args: string[], overrides: Record<string, string> = {}): Promise<Result> => {
      const child = Bun.spawn(args, { cwd: root, env: { ...env, ...overrides }, stdout: 'pipe', stderr: 'pipe' })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return { code, stdout, stderr }
    }
    const git = (...args: string[]) => capture(['git', ...args])
    for (
      const args of [
        ['init', '--quiet', '--initial-branch=main'],
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.test',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '--quiet',
          '--allow-empty',
          '-m',
          'fixture',
        ],
        ['clone', '--quiet', '--bare', root, remote],
        ['remote', 'add', 'origin', 'git@github.com:tao-dev-org/tao-lang.git'],
        ['config', '--global', 'url.git@github.com:.insteadOf', 'https://github.com/'],
        ['config', '--global', '--add', 'url.git@github.com:.insteadOf', 'git://github.com/'],
        ['config', '--global', 'url.ssh://git@github.com/.insteadOf', 'https://github.com/'],
        ['config', '--global', 'url.https://github.com/.insteadOf', 'git://github.com/'],
      ]
    ) {
      const result = await git(...args)
      if (result.code !== 0) {
        Errors.ThrowUnexpected(`Fixture failed: ${result.stderr}`)
      }
    }
    await work({
      root,
      git,
      setup: (entry, overrides) =>
        capture(
          entry === 'just'
            ? ['just', '--justfile', join(root, 'Justfile'), 'setup-github']
            : [join(root, entry), 'setup-github'],
          overrides,
        ),
    })
  }, { finally: () => rm(directory, { recursive: true, force: true }) })
}

Describe('GitHub setup parity', () => {
  for (const entry of ['just', 'agent'] as const) {
    Test(`${entry} configures HTTPS rewrites, GitHub credentials and a verified origin`, async () => {
      await withFixture(async ({ root, git, setup }) => {
        const result = await setup(entry)
        if (result.code !== 0) {
          Errors.ThrowUnexpected(`Setup failed: ${result.stdout}\n${result.stderr}`)
        }
        Expect((await git('config', '--global', '--get-all', 'url.https://github.com/.insteadOf')).stdout)
          .toBe('git@github.com:\nssh://git@github.com/\n')
        for (const key of ['url.git@github.com:.insteadOf', 'url.ssh://git@github.com/.insteadOf']) {
          Expect((await git('config', '--global', '--get-all', key)).code).toBe(1)
        }
        Expect((await git('config', '--get', 'remote.origin.url')).stdout)
          .toBe('https://github.com/tao-dev-org/tao-lang.git\n')
        Expect(await readFile(join(root, 'gh-calls'), 'utf8')).toBe(
          'auth status --hostname github.com\nconfig set git_protocol https --host github.com\nauth setup-git --hostname github.com\n',
        )
        Expect(result.stdout).toContain(
          'GitHub HTTPS authentication is ready for https://github.com/tao-dev-org/tao-lang.git.',
        )
        Expect(result.stdout + result.stderr).not.toContain('auth status diagnostics')
      })
    })
  }

  Test('logs in through the HTTPS web flow when authentication is missing', async () => {
    await withFixture(async ({ root, setup }) => {
      Expect((await setup('dev', { TAO_SETUP_GITHUB_AUTH_STATUS: '1' })).code).toBe(0)
      Expect(await readFile(join(root, 'gh-calls'), 'utf8')).toContain(
        'auth login --hostname github.com --git-protocol https --web\n',
      )
    })
  })

  for (const failure of ['login', 'helper', 'main'] as const) {
    Test(`preserves ${failure} failure and does not report successful setup`, async () => {
      await withFixture(async ({ root, git, setup }) => {
        if (failure === 'main') {
          Expect((await git('--git-dir', join(root, '..', 'remote.git'), 'update-ref', '-d', 'refs/heads/main')).code)
            .toBe(0)
        }
        const result = await setup(
          'dev',
          failure === 'login'
            ? { TAO_SETUP_GITHUB_AUTH_STATUS: '1', TAO_SETUP_GITHUB_LOGIN_EXIT: '23' }
            : failure === 'helper'
            ? { TAO_SETUP_GITHUB_HELPER_EXIT: '29' }
            : {},
        )
        Expect(result.code).toBe(failure === 'login' ? 23 : failure === 'helper' ? 29 : 2)
        Expect(result.stdout).not.toContain('authentication is ready')
        if (failure !== 'main') {
          Expect((await git('config', '--get', 'remote.origin.url')).stdout)
            .toBe('git@github.com:tao-dev-org/tao-lang.git\n')
        }
      })
    })
  }
})
