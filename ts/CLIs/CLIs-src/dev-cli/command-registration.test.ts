import { Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

type Result = { code: number; stdout: string; stderr: string }

async function withFixture(
  work: (
    write: (source: string) => Promise<void>,
    run: (...args: string[]) => Promise<Result>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'tao-command-registration-'))
  await Try(async () => {
    const repository = fileURLToPath(new URL('../../../../', import.meta.url))
    await mkdir(join(root, 'ts'))
    for (const entry of ['ts/CLIs', 'ts/shared', 'ts/tsconfig.json', 'ts/tsconfig.base.json']) {
      await cp(join(repository, entry), join(root, entry), { recursive: true })
    }
    await symlink(join(repository, 'ts/node_modules'), join(root, 'ts/node_modules'))
    const script = join(root, 'ts/probe.ts')
    await work(
      async source => {
        await Bun.write(
          script,
          `
import { registerCommand, execute } from './CLIs/CLIs-src/dev-cli/commands/_command-runner'
import { Errors } from '@shared'
${source}
await execute()
`,
        )
      },
      async (...args) => {
        const child = Bun.spawn([process.execPath, 'run', script, ...args], {
          cwd: join(root, 'ts'),
          env: { ...process.env, TAO_DEBUG_ERRORS: '0' },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])
        return { code, stdout, stderr }
      },
    )
  }, { finally: () => rm(root, { recursive: true, force: true }) })
}

Describe('shared command registration', () => {
  Test('maps argument metadata and preserves Commander usage and help behavior', async () => {
    await withFixture(async (write, run) => {
      await write(`
registerCommand({
    name: 'probe', description: 'Probe argument metadata.',
    arguments: [
        { name: 'source', description: 'Required source.', required: true },
        { name: 'target', description: 'Optional target.', defaultValue: 'fallback' },
    ],
    action: async (source: string, target: string) => { console.log(JSON.stringify([source, target])) },
})
registerCommand({
    name: 'many', description: 'Probe variadic arguments.',
    arguments: [{ name: 'values', variadic: true }],
    action: (values: string[]) => { console.log(JSON.stringify(values)) },
})
registerCommand({
    name: 'pass', description: 'Probe passthrough options.',
    arguments: [{ name: 'values', variadic: true }], allowUnknownOptions: true,
    action: (values: string[]) => { console.log(JSON.stringify(values)) },
})
`)
      Expect(await run('probe', 'input')).toEqual({ code: 0, stdout: '["input","fallback"]\n', stderr: '' })
      Expect((await run('probe', 'input', 'with spaces')).stdout).toBe('["input","with spaces"]\n')
      Expect((await run('many')).stdout).toBe('[]\n')
      Expect((await run('many', 'first', 'with spaces')).stdout).toBe('["first","with spaces"]\n')
      Expect((await run('pass', '--flag', 'value')).stdout).toBe('["--flag","value"]\n')
      const missing = await run('probe')
      Expect(missing.code).toBe(1)
      Expect(missing.stderr).toContain("missing required argument 'source'")
      const help = await run('probe', '--help')
      Expect(help.code).toBe(0)
      Expect(help.stdout).toContain('Probe argument metadata.')
      Expect(help.stdout).toContain('Optional target.')
    })
  })

  Test('catches synchronous and asynchronous failures with structured or best-effort messages', async () => {
    await withFixture(async (write, run) => {
      for (
        const [action, message] of [
          ["() => { Errors.ThrowUserInput('Fix the command input.') }", 'Fix the command input.'],
          [
            "async () => { await Promise.resolve(); Errors.ThrowHostEnvironment('Install the missing tool.') }",
            'Install the missing tool.',
          ],
          ["() => { throw new Error('Plain command failure.') }", 'Plain command failure.'],
          ["() => { throw { message: 'Carried failure message.' } }", 'Carried failure message.'],
          ["() => { throw { get message() { throw new Error('broken formatter') } } }", 'Command failed.'],
        ]
      ) {
        await write(
          `registerCommand({ name: 'fail', description: 'Failure fixture.', action: ${action} })`,
        )
        const result = await run('fail')
        Expect(result).toEqual({ code: 1, stdout: '', stderr: `${message}\n` })
      }
    })
  })

  Test('retains the explicit action exit code when no exception is thrown', async () => {
    await withFixture(async (write, run) => {
      await write(
        `registerCommand({ name: 'verdict', description: 'Child verdict fixture.', action: () => { process.exitCode = 23 } })`,
      )
      Expect(await run('verdict')).toEqual({ code: 23, stdout: '', stderr: '' })
    })
  })
})
