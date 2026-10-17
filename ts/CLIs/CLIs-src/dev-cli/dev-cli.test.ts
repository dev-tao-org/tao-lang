import { S, Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

Describe('developer branch workflow', () => {
  for (const selectionFails of [false, true]) {
    Test(
      selectionFails
        ? 'stops before synchronization when branch selection fails'
        : 'synchronizes after selecting a branch and reports a synchronization failure',
      async () => {
        const root = await mkdtemp(join(tmpdir(), 'tao-cli-branch-'))
        await Try(async () => {
          const repository = fileURLToPath(new URL('../../../../', import.meta.url))
          await mkdir(join(root, 'ts'), { recursive: true })
          await mkdir(join(root, 'old-tao-v1'))
          await mkdir(join(root, '.config'))
          await cp(join(repository, '.config/cli-environment.sh'), join(root, '.config/cli-environment.sh'))
          for (const entry of ['dev', 'ts/CLIs', 'ts/shared', 'ts/tsconfig.json', 'ts/tsconfig.base.json']) {
            await cp(join(repository, entry), join(root, entry), { recursive: true })
          }
          await symlink(join(repository, 'ts/node_modules'), join(root, 'ts/node_modules'))
          const legacyDev = join(root, 'old-tao-v1/dev')
          await Bun.write(
            legacyDev,
            S`
              #!/bin/sh
              printf "%s\\n" "$*" >> "$TAO_BRANCH_CALLS"
              case "$1" in
                my-branch) exit "$TAO_BRANCH_SELECTION_EXIT" ;;
                my-sync) exit 23 ;;
                *) exit 64 ;;
              esac
            `,
          )
          await chmod(legacyDev, 0o755)
          const calls = join(root, 'calls')
          const child = Bun.spawn([join(root, 'dev'), 'my-branch', 'ro'], {
            cwd: root,
            env: {
              ...process.env,
              TAO_DEVENV: '1',
              DEVENV_ROOT: root,
              TAO_BRANCH_CALLS: calls,
              TAO_BRANCH_SELECTION_EXIT: selectionFails ? '17' : '0',
            },
            stdout: 'pipe',
            stderr: 'pipe',
          })
          const [code] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ])
          Expect(code).toBe(selectionFails ? 17 : 23)
          Expect(await Bun.file(calls).text()).toBe(selectionFails ? 'my-branch ro\n' : 'my-branch ro\nmy-sync\n')
        }, { finally: () => rm(root, { recursive: true, force: true }) })
      },
    )
  }
})
