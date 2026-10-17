import { S, Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

type Result = { code: number; stdout: string; stderr: string }

Describe('shared command registration', () => {
  Test('reports action rejections and uncaught callback failures through the global handler', async () => {
    await withFixture(async (write, run) => {
      for (
        const [action, message] of [
          ["() => { Errors.ThrowUserInput('Fix the command input.') }", 'Fix the command input.'],
          [
            "async () => { await Promise.resolve(); Errors.ThrowHostEnvironment('Install the missing tool.') }",
            'Install the missing tool.',
          ],
          ["() => { throw new Error('Plain command failure.') }", 'Plain command failure.'],
          [
            "() => { setTimeout(() => { throw new Error('Escaped callback failure.') }, 0) }",
            'Escaped callback failure.',
          ],
        ]
      ) {
        await write(
          `registerCommand({ name: 'fail', description: 'Failure fixture.', action: ${action} })`,
        )
        const result = await run('fail')
        Expect(result.code).toBe(1)
        Expect(result.stdout).toBe('')
        Expect(result.stderr).toContain(message)
        Expect(result.stderr).toMatch(/\u001b\[33m[\s\S]+\u001b\[0m\n\u001b\[31m/)
      }
    })
  })

  Test('preserves structured failure statuses and stops execution after an action rejects', async () => {
    await withFixture(async (write, run) => {
      for (const [status, expected] of [[23, 23], [0, 1], [256, 1]]) {
        await write(
          `registerCommand({ name: 'verdict', description: 'Child verdict fixture.', action: () => Errors.ThrowCommandExecution({ command: 'fixture', args: [], status: ${status}, signal: null, stdout: '', stderr: '' }) })`,
        )
        const first = await run('verdict')
        Expect(first.code).toBe(expected)
        Expect(first.stderr).toContain('Command failed: fixture')
      }
      await write(S`
        await registerCommand({ name: 'prior', description: 'Earlier failure.', action: () => Errors.ThrowCommandExecution({ command: 'fixture', args: [], status: 29, signal: null, stdout: '', stderr: '' }) }).action()
        process.stdout.write('continued after failure')
        registerCommand({ name: 'verdict', description: 'Later success.', action: () => {} })
      `)
      const second = await run('verdict')
      Expect(second.code).toBe(29)
      Expect(second.stdout).toBe('')
      Expect(second.stderr).toContain('Command failed: fixture')
    })
  })
})

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
            import './CLIs/CLIs-src/cli-kit/fatal-errors'
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
          env: {
            ...process.env,
            TAO_AGENT: '0',
            TAO_AGENT_LOG: join(root, '.artifacts/agent.log'),
          },
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
