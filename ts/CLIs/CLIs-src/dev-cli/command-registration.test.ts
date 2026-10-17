import { S, Try } from '@shared'
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
          S`
            import { registerCommand, execute } from './CLIs/CLIs-src/dev-cli/commands/_command-runner'
            import { Errors } from '@shared'
            ${source}
            await execute()
          `,
        )
      },
      async (...args) => {
        const child = Bun.spawn(['bun', 'run', script, ...args], {
          cwd: join(root, 'ts'),
          env: { ...process.env, TAO_AGENT_LOG: join(root, '.artifacts/agent.log'), TAO_DEBUG_ERRORS: '0' },
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

  Test('applies structured command failures and preserves an existing failure after a successful action', async () => {
    await withFixture(async (write, run) => {
      await write(
        `registerCommand({ name: 'verdict', description: 'Child verdict fixture.', action: () => Errors.ThrowCommandExecution({ command: 'fixture', args: [], status: 23, signal: null, stdout: '', stderr: '' }) })`,
      )
      Expect(await run('verdict')).toEqual({ code: 23, stdout: '', stderr: 'Command failed: fixture\n' })
      await write(S`
        await registerCommand({ name: 'prior', description: 'Earlier failure.', action: () => Errors.ThrowCommandExecution({ command: 'fixture', args: [], status: 29, signal: null, stdout: '', stderr: '' }) }).action()
        registerCommand({ name: 'verdict', description: 'Later success.', action: () => {} })
      `)
      Expect(await run('verdict')).toEqual({ code: 29, stdout: '', stderr: 'Command failed: fixture\n' })
    })
  })
})
