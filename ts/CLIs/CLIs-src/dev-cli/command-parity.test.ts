import { Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
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
    for (
      const entry of ['agent', 'dev', 'Justfile', 'ts/CLIs', 'ts/shared', 'ts/tsconfig.json', 'ts/tsconfig.base.json']
    ) {
      await cp(join(repository, entry), join(root, entry), {
        recursive: true,
        filter: path => !path.endsWith('.test.ts'),
      })
    }
    await symlink(join(repository, 'ts/node_modules'), join(root, 'ts/node_modules'))
    await Bun.write(join(root, 'old-tao-v1/Justfile'), 'fix:\n    exit 0\n')
    await Bun.write(
      join(root, 'ts/smoke.test.ts'),
      "import { test, expect } from 'bun:test'\n"
        + "test('new workspace', async () => { await Bun.write(process.env.TAO_PARITY_TEST_MARKER!, 'ran'); expect(1).toBe(1) })\n",
    )
    for (const [path, name] of [['bin/just', 'just'], ['bin/dprint', 'dprint'], ['old-tao-v1/dev', 'legacy-dev']]) {
      await Bun.write(
        join(root, path!),
        `#!/bin/sh
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
  Test('both entrypoints fix only the new workspace and preserve formatter failures', async () => {
    await withFixture(async ({ root, run }) => {
      for (const entry of ['dev', 'agent'] as const) {
        const result = await run(entry, ['fix'])
        Expect(result.code).toBe(0)
        Expect(result.calls.some(call => call.includes('/old-tao-v1'))).toBe(false)
        Expect(result.calls.some(call => call.startsWith(`dprint|${root}|fmt|`))).toBe(true)
        Expect(result.calls).toContain(`just|${root}|--fmt|--justfile|${root}/Justfile`)
        const failed = await run(entry, ['fix'], 'fmt')
        Expect(failed.code).toBe(23)
        Expect(failed.calls.some(call => call.endsWith('|fix'))).toBe(false)
      }
    })
  })

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

  Test('clean removes only new workspace dependencies and preserves legacy dependencies', async () => {
    await withFixture(async ({ root, run }) => {
      const dependencies = join(root, 'ts/node_modules')
      const target = await realpath(dependencies)
      const legacyDependency = join(root, 'old-tao-v1/node_modules/keep.txt')
      await Bun.write(legacyDependency, 'legacy dependency')
      const cleaned = await run('agent', ['clean'])
      Expect(cleaned.code).toBe(0)
      Expect(cleaned.calls).toEqual([])
      Expect(await Bun.file(join(dependencies, 'commander/package.json')).exists()).toBe(false)
      Expect((await lstat(target)).isDirectory()).toBe(true)
      Expect(await Bun.file(legacyDependency).text()).toBe('legacy dependency')
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

  Test('default tests run only new tests and reject legacy paths and symlink aliases', async () => {
    await withFixture(async ({ root, run }) => {
      const legacyMarker = join(root, 'legacy-test-ran')
      await Bun.write(
        join(root, 'old-tao-v1/forbidden.test.ts'),
        `import { test } from 'bun:test'\ntest('legacy must not run', async () => { await Bun.write(${
          JSON.stringify(legacyMarker)
        }, 'ran') })\n`,
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

  Test('formats shared files without entering the legacy implementation', async () => {
    await withFixture(async ({ root, run }) => {
      await Bun.write(join(root, 'old-tao-v1/fixture with spaces.tao'), 'fixture')
      const tao = await run('agent', ['fmt', 'old-tao-v1/fixture with spaces.tao'])
      Expect(tao.code).toBe(1)
      Expect(tao.calls).toEqual([])
      Expect(tao.output).toContain('Run legacy workflows from old-tao-v1/')
      const just = await run('agent', ['fmt', 'Justfile'])
      Expect(just.calls).toEqual([`just|${root}|--fmt|--justfile|${root}/Justfile`])
      const all = await run('agent', ['fmt'])
      Expect(all.code).toBe(0)
      Expect(all.calls).toContain(`just|${root}|--fmt|--justfile|${root}/Justfile`)
      Expect(all.calls.some(call => call.includes('/old-tao-v1|'))).toBe(false)
      await symlink(join(root, 'old-tao-v1'), join(root, 'legacy-alias'))
      const aliasGlob = await run('agent', ['fmt', 'legacy-alias/*.tao'])
      Expect(aliasGlob.code).toBe(1)
      Expect(aliasGlob.calls).toEqual([])
      Expect(aliasGlob.output).toContain('Run legacy workflows from old-tao-v1/')
    })
  })
})
