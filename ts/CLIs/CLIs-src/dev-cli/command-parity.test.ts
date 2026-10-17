import { S, Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

async function withFixture(
  work: (fixture: {
    root: string
    run: (
      entry: 'dev' | 'agent',
      args: string[],
      fail?: string,
    ) => Promise<{ code: number; output: string; calls: string[] }>
  }) => Promise<void>,
): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tao-command-parity-')))
  await Try(async () => {
    const repository = fileURLToPath(new URL('../../../../', import.meta.url))
    await mkdir(join(root, 'ts'))
    await mkdir(join(root, 'old-tao-v1'))
    await mkdir(join(root, 'bin'))
    await mkdir(join(root, '.config'))
    await cp(join(repository, '.config/cli-environment.sh'), join(root, '.config/cli-environment.sh'))
    for (
      const entry of ['agent', 'dev', 'Justfile', 'ts/CLIs', 'ts/shared', 'ts/tsconfig.json', 'ts/tsconfig.base.json']
    ) {
      await cp(join(repository, entry), join(root, entry), {
        recursive: true,
        filter: path => !path.endsWith('.test.ts'),
      })
    }
    const dependencies = join(root, 'ts/node_modules')
    await mkdir(dependencies)
    for (const name of await readdir(join(repository, 'ts/node_modules'))) {
      if (name !== '.bin') {
        await symlink(join(repository, 'ts/node_modules', name), join(dependencies, name))
      }
    }
    await mkdir(join(dependencies, '.bin'))
    await Bun.write(
      join(dependencies, '.bin/tsc'),
      S`
        #!/usr/bin/env bun
        import { appendFileSync } from 'node:fs'
        appendFileSync(process.env.TAO_PARITY_CALLS, 'tsc|' + process.cwd() + '|' + Bun.argv.slice(2).join('|') + '\\n')
      `,
    )
    await chmod(join(dependencies, '.bin/tsc'), 0o755)
    await Bun.write(join(root, 'old-tao-v1/Justfile'), 'fix:\n    exit 0\n')
    await Bun.write(
      join(root, 'ts/smoke.test.ts'),
      S`
        import { test, expect } from 'bun:test'
        test('new workspace', async () => { await Bun.write(process.env.TAO_PARITY_TEST_MARKER!, 'ran'); expect(1).toBe(1) })
      `,
    )
    for (const [path, name] of [['bin/just', 'just'], ['bin/dprint', 'dprint'], ['old-tao-v1/dev', 'legacy-dev']]) {
      await Bun.write(
        join(root, path!),
        S`
          #!/bin/sh
          printf '%s|%s' '${name}' "$PWD" >> "$TAO_PARITY_CALLS"
          for arg in "$@"; do printf '|%s' "$arg" >> "$TAO_PARITY_CALLS"; done
          printf '\\n' >> "$TAO_PARITY_CALLS"
          if [ -n "$TAO_PARITY_FAIL" ]; then
            for arg in "$@"; do [ "$arg" != "$TAO_PARITY_FAIL" ] || exit 23; done
          fi
        `,
      )
      await chmod(join(root, path!), 0o755)
    }
    await work({
      root,
      run: async (entry, args, fail = '') => {
        const calls = join(root, 'calls')
        await Bun.write(calls, '')
        const child = Bun.spawn([join(root, entry), ...args], {
          cwd: root,
          env: {
            ...process.env,
            TAO_DEVENV: '1',
            DEVENV_ROOT: root,
            TAO_AGENT_LOG: join(root, '.artifacts/agent.log'),
            PATH: `${join(root, 'bin')}:${process.env.PATH}`,
            TAO_PARITY_CALLS: calls,
            TAO_PARITY_FAIL: fail,
            TAO_PARITY_TEST_MARKER: join(root, 'test-ran'),
          },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])
        return {
          code,
          output: stdout + stderr,
          calls: (await readFile(calls, 'utf8')).trim().split('\n').filter(Boolean),
        }
      },
    })
  }, { finally: () => rm(root, { recursive: true, force: true }) })
}

Describe('root workflow boundaries', () => {
  Test('registers the remaining Just workflows with legacy preparation, arguments and working directory', async () => {
    await withFixture(async ({ root, run }) => {
      for (
        const [args, recipe] of [
          [['doctor', '--json'], 'doctor|--json'],
          [['secrets', 'list'], 'secrets|list'],
          [['start', 'local-instantdb'], 'start-local-instantdb'],
          [['stop', 'local-instantdb'], 'stop-local-instantdb'],
        ] as const
      ) {
        const result = await run('agent', [...args])
        Expect(result.code).toBe(0)
        Expect(result.calls).toEqual([`just|${root}/old-tao-v1|--justfile|${root}/old-tao-v1/Justfile|${recipe}`])
      }
      const unknown = await run('dev', ['stop', 'unrecognized-service'])
      Expect(unknown.code).toBe(1)
      Expect(unknown.calls).toEqual([])
      Expect(unknown.output).toContain('local-instantdb')
    })
  })

  Test('check does not run tests and all validation commands stay in the new workspace', async () => {
    await withFixture(async ({ root, run }) => {
      for (const command of ['check', 'typecheck', 'lint', 'verify']) {
        const result = await run('agent', [command])
        Expect(result.code).toBe(0)
        Expect(result.calls.some(call => call.includes('/old-tao-v1'))).toBe(false)
        Expect(await Bun.file(join(root, 'test-ran')).exists()).toBe(command === 'verify')
      }
      for (const command of ['check', 'verify']) {
        const failed = await run('agent', [command], command === 'check' ? 'check' : 'fmt')
        Expect(failed.code).toBe(23)
      }
    })
  }, 30_000)

  Test('lint, check and verify reject source violations before running tests', async () => {
    await withFixture(async ({ root, run }) => {
      await Bun.write(
        join(root, 'ts/violations.ts'),
        [
          'export const undocumented = 1',
          '/** helper performs private work. */',
          'function helper() { try { return undocumented } catch { return 0 } }',
          '/* use line comments */',
        ].join('\n'),
      )
      for (const command of ['lint', 'check', 'verify']) {
        const result = await run('agent', [command])
        Expect(result.code).toBe(1)
        Expect(result.output).toContain('ts/violations.ts:1: exported API undocumented needs JSDoc')
        Expect(result.output).toContain('private JSDoc')
        Expect(result.output).toContain('use Try')
        Expect(result.output).toContain('use //')
        Expect(result.calls.some(call => call.includes('/old-tao-v1'))).toBe(false)
        Expect(await Bun.file(join(root, 'test-ran')).exists()).toBe(false)
      }
    })
  }, 30_000)

  Test('default tests run only new tests and reject legacy paths and symlink aliases', async () => {
    await withFixture(async ({ root, run }) => {
      const legacyMarker = join(root, 'legacy-test-ran')
      await Bun.write(
        join(root, 'old-tao-v1/forbidden.test.ts'),
        S`
          import { test } from 'bun:test'
          test('legacy must not run', async () => { await Bun.write(${JSON.stringify(legacyMarker)}, 'ran') })
        `,
      )
      const all = await run('agent', ['test'])
      Expect(all.code).toBe(0)
      Expect(all.output).toContain('new workspace')
      Expect(all.calls).toEqual([])
      Expect(await Bun.file(join(root, 'test-ran')).text()).toBe('ran')
      const scoped = await run('agent', ['test', './smoke.test.ts'])
      Expect(scoped.code).toBe(0)
      Expect(scoped.calls).toEqual([])
      for (const target of [root, '..']) {
        const ancestor = await run('agent', ['test', target])
        Expect(ancestor.code).toBe(0)
        Expect(ancestor.calls).toEqual([])
        Expect(await Bun.file(legacyMarker).exists()).toBe(false)
      }
      const legacy = await run('agent', ['test', 'old-tao-v1/packages/example with spaces.test.ts'])
      Expect(legacy.code).toBe(1)
      Expect(legacy.calls).toEqual([])
      Expect(legacy.output).toContain('Run legacy workflows from old-tao-v1/')
      await symlink(join(root, 'old-tao-v1'), join(root, 'ts/legacy-alias'))
      const alias = await run('agent', ['test', './legacy-alias'])
      Expect(alias.code).toBe(1)
      Expect(alias.calls).toEqual([])
      const defaultWithAlias = await run('agent', ['test'])
      Expect(defaultWithAlias.code).toBe(1)
      Expect(defaultWithAlias.output).toContain('Run legacy workflows from old-tao-v1/')
      Expect(await Bun.file(legacyMarker).exists()).toBe(false)
      await rm(join(root, 'ts/legacy-alias'))
      await Bun.write(
        join(root, 'ts/smoke.test.ts'),
        "import { test, expect } from 'bun:test'\ntest('new failure', () => expect(1).toBe(2))\n",
      )
      const failed = await run('agent', ['test'])
      Expect(failed.code).toBe(1)
      Expect(failed.output).toContain('new failure')
      Expect(await Bun.file(legacyMarker).exists()).toBe(false)
    })
  })

  Test('rejects legacy formatting paths and aliases before invoking external tools', async () => {
    await withFixture(async ({ root, run }) => {
      await Bun.write(join(root, 'old-tao-v1/fixture with spaces.tao'), 'fixture')
      const tao = await run('agent', ['fmt', 'old-tao-v1/fixture with spaces.tao'])
      Expect(tao.code).toBe(1)
      Expect(tao.calls).toEqual([])
      Expect(tao.output).toContain('Run legacy workflows from old-tao-v1/')
      await symlink(join(root, 'old-tao-v1'), join(root, 'legacy-alias'))
      const aliasGlob = await run('agent', ['fmt', 'legacy-alias/*.tao'])
      Expect(aliasGlob.code).toBe(1)
      Expect(aliasGlob.calls).toEqual([])
      Expect(aliasGlob.output).toContain('Run legacy workflows from old-tao-v1/')
    })
  })
})
