import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMyBranch } from './commands/my-branch'

const justfile = fileURLToPath(new URL('../../../../Justfile', import.meta.url))

Describe('developer setup command', () => {
  Test('installs from a fresh workspace before loading Commander', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tao-cli-setup-'))
    try {
      const repository = fileURLToPath(new URL('../../../../', import.meta.url))
      await mkdir(join(root, 'ts'), { recursive: true })
      await cp(join(repository, 'dev'), join(root, 'dev'))
      await cp(join(repository, 'ts/CLIs'), join(root, 'ts/CLIs'), { recursive: true })
      await cp(join(repository, 'ts/tsconfig.json'), join(root, 'ts/tsconfig.json'))
      await cp(join(repository, 'ts/tsconfig.base.json'), join(root, 'ts/tsconfig.base.json'))
      await Bun.write(join(root, 'local-package/package.json'), JSON.stringify({ name: 'setup-fixture', version: '1.0.0' }))
      await Bun.write(join(root, 'ts/package.json'), JSON.stringify({
        private: true,
        dependencies: { 'setup-fixture': 'file:../local-package' },
      }))
      const child = Bun.spawn([join(root, 'dev'), 'setup', '--ignore-scripts'], {
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      if (exitCode !== 0) throw new Error(`Setup failed: ${stdout}\n${stderr}`)
      Expect(await Bun.file(join(root, 'ts/node_modules/setup-fixture/package.json')).exists()).toBe(true)
      Expect(await Bun.file(join(root, 'node_modules/setup-fixture/package.json')).exists()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

Describe('developer branch workflow', () => {
  Test('synchronizes after selecting a branch and reports a synchronization failure', async () => {
    const calls: string[][] = []
    const exitCode = await runMyBranch('ro', async args => {
      calls.push(args)
      return args[0] === 'my-sync' ? 23 : 0
    })

    Expect(calls).toEqual([['my-branch', 'ro'], ['my-sync']])
    Expect(exitCode).toBe(23)
  })

  Test('stops before synchronization when branch selection fails', async () => {
    const calls: string[][] = []
    const exitCode = await runMyBranch('ro', async args => {
      calls.push(args)
      return 17
    })

    Expect(calls).toEqual([['my-branch', 'ro']])
    Expect(exitCode).toBe(17)
  })
})

Describe('root test command', () => {
  for (const succeeds of [true, false]) {
    Test(`returns the verdict of a ${succeeds ? 'passing' : 'failing'} test file`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'tao-cli-test-'))
      try {
        const fixture = join(root, 'test fixture.test.ts')
        await Bun.write(fixture, `
          import { expect, test } from 'bun:test'
          test('CLI test fixture', () => expect(1).toBe(${succeeds ? 1 : 2}))
        `)
        const child = Bun.spawn(['just', '--justfile', justfile, 'test', fixture], {
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const [exitCode, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])

        if (exitCode !== (succeeds ? 0 : 1)) {
          throw new Error(`Unexpected CLI exit ${exitCode}:\n${stdout}\n${stderr}`)
        }
        Expect(exitCode).toBe(succeeds ? 0 : 1)
        Expect(stdout + stderr).toContain('CLI test fixture')
        Expect(stdout + stderr).toContain(succeeds ? '1 pass' : 'Expected: 2')
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }
})
