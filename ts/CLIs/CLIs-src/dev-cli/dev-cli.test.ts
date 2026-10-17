import { Errors, Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const justfile = fileURLToPath(new URL('../../../../Justfile', import.meta.url))

Describe('shared developer and agent commands', () => {
  Test('format repository-relative paths and preserve check failures through both entrypoints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tao-cli-shared-'))
    await Try(async () => {
      const repository = fileURLToPath(new URL('../../../../', import.meta.url))
      await mkdir(join(root, 'ts'), { recursive: true })
      for (const entry of ['agent', 'dev', 'ts/CLIs', 'ts/shared', 'ts/tsconfig.json', 'ts/tsconfig.base.json']) {
        await cp(join(repository, entry), join(root, entry), { recursive: true })
      }
      await symlink(join(repository, 'ts/node_modules'), join(root, 'ts/node_modules'))
      await Bun.write(
        join(root, '.dprint.jsonc'),
        JSON.stringify({
          plugins: [join(repository, 'ts/node_modules/@dprint/typescript/plugin.wasm')],
          typescript: { semiColons: 'asi', quoteStyle: 'preferSingle' },
        }),
      )
      const source = join(root, 'ts/format fixture.ts')
      for (const entry of ['dev', 'agent']) {
        await Bun.write(source, 'export const value:number="wrong";\n')
        const format = Bun.spawn([join(root, entry), 'fmt', 'ts/format fixture.ts'], {
          cwd: root,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const [formatted] = await Promise.all([
          format.exited,
          new Response(format.stdout).text(),
          new Response(format.stderr).text(),
        ])
        Expect(formatted).toBe(0)
        Expect(await Bun.file(source).text()).toBe("export const value: number = 'wrong'\n")
        const kit = join(root, 'ts/CLIs/CLIs-src/cli-kit/cli-kit.ts')
        await Bun.write(kit, `${await Bun.file(kit).text()}\nconst checkedByTsc${entry}: number = 'wrong'\n`)
        const check = Bun.spawn([join(root, entry), 'check'], {
          cwd: root,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const [checked, stdout, stderr] = await Promise.all([
          check.exited,
          new Response(check.stdout).text(),
          new Response(check.stderr).text(),
        ])
        Expect(checked).not.toBe(0)
        Expect(stdout + stderr).toContain('TS2322')
        Expect(stdout + stderr).toContain('cli-kit/cli-kit.ts')
      }
    }, { finally: () => rm(root, { recursive: true, force: true }) })
  })
})

Describe('developer setup command', () => {
  Test.each(['dev', 'agent'])('%s installs from a fresh workspace before loading Commander', async entry => {
    const root = await mkdtemp(join(tmpdir(), 'tao-cli-setup-'))
    await Try(async () => {
      const repository = fileURLToPath(new URL('../../../../', import.meta.url))
      await mkdir(join(root, 'ts'), { recursive: true })
      await cp(join(repository, entry), join(root, entry))
      await cp(join(repository, 'ts/CLIs'), join(root, 'ts/CLIs'), { recursive: true })
      await cp(join(repository, 'ts/shared'), join(root, 'ts/shared'), { recursive: true })
      await cp(join(repository, 'ts/tsconfig.json'), join(root, 'ts/tsconfig.json'))
      await cp(join(repository, 'ts/tsconfig.base.json'), join(root, 'ts/tsconfig.base.json'))
      await Bun.write(
        join(root, 'local-package/package.json'),
        JSON.stringify({ name: 'setup-fixture', version: '1.0.0' }),
      )
      await Bun.write(
        join(root, 'ts/package.json'),
        JSON.stringify({
          private: true,
          dependencies: { 'setup-fixture': 'file:../local-package' },
        }),
      )
      const log = join(root, '.artifacts/logs/agent/bootstrap.log')
      const child = Bun.spawn([join(root, entry), 'setup', '--ignore-scripts'], {
        cwd: root,
        env: { ...process.env, TAO_AGENT_LOG: log },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      if (status !== 0) {
        Errors.ThrowUnexpected(`Setup failed: ${stdout}\n${stderr}`)
      }
      Expect(await Bun.file(join(root, 'ts/node_modules/setup-fixture/package.json')).exists()).toBe(true)
      Expect(await Bun.file(join(root, 'node_modules/setup-fixture/package.json')).exists()).toBe(false)
      Expect(await Bun.file(log).exists()).toBe(entry === 'agent')
      if (entry === 'agent') {
        Expect(await Bun.file(log).text()).toContain('RUN CMD: ')
        Expect(stdout).not.toContain('RUN CMD: ')
      } else {
        Expect(stdout).toContain('RUN CMD: ')
      }
    }, { finally: () => rm(root, { recursive: true, force: true }) })
  })
})

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
          for (const entry of ['dev', 'ts/CLIs', 'ts/shared', 'ts/tsconfig.json', 'ts/tsconfig.base.json']) {
            await cp(join(repository, entry), join(root, entry), { recursive: true })
          }
          await symlink(join(repository, 'ts/node_modules'), join(root, 'ts/node_modules'))
          const legacyDev = join(root, 'old-tao-v1/dev')
          await Bun.write(
            legacyDev,
            '#!/bin/sh\n'
              + 'printf "%s\\n" "$*" >> "$TAO_BRANCH_CALLS"\n'
              + 'case "$1" in\n'
              + '  my-branch) exit "$TAO_BRANCH_SELECTION_EXIT" ;;\n'
              + '  my-sync) exit 23 ;;\n'
              + '  *) exit 64 ;;\n'
              + 'esac\n',
          )
          await chmod(legacyDev, 0o755)
          const calls = join(root, 'calls')
          const child = Bun.spawn([join(root, 'dev'), 'my-branch', 'ro'], {
            cwd: root,
            env: { ...process.env, TAO_BRANCH_CALLS: calls, TAO_BRANCH_SELECTION_EXIT: selectionFails ? '17' : '0' },
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

Describe('root test command', () => {
  for (const succeeds of [true, false]) {
    Test(`returns the verdict of a ${succeeds ? 'passing' : 'failing'} test file`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'tao-cli-test-'))
      await Try(async () => {
        const fixture = join(root, 'test fixture.test.ts')
        await Bun.write(
          fixture,
          `
          import { expect, test } from 'bun:test'
          test('CLI test fixture', () => expect(1).toBe(${succeeds ? 1 : 2}))
        `,
        )
        const child = Bun.spawn(['just', '--justfile', justfile, 'test', fixture], {
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const [status, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])

        if (status !== (succeeds ? 0 : 1)) {
          Errors.ThrowUnexpected(`Unexpected CLI exit ${status}:\n${stdout}\n${stderr}`)
        }
        Expect(status).toBe(succeeds ? 0 : 1)
        Expect(stdout).toContain('test --reporter=dots ')
        if (!succeeds) {
          Expect(stdout + stderr).toContain('CLI test fixture')
        }
        Expect(stdout + stderr).not.toContain('(pass) CLI test fixture')
        Expect(stdout + stderr).toContain(succeeds ? '1 pass' : 'Expected: 2')
      }, { finally: () => rm(root, { recursive: true, force: true }) })
    })
  }
})
