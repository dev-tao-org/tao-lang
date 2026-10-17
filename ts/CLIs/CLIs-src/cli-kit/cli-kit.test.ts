import { Try } from '@shared'
import { describe as Describe, expect as Expect, test as Test } from 'bun:test'
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSteps } from './cli-kit'

type Result = { code: number; stdout: string; stderr: string; log: string }

async function withProbe(
  work: (
    run: (source: string, agent?: boolean, args?: string[]) => Promise<Result>,
    root: string,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'tao-command-io-'))
  await Try(async () => {
    const repository = fileURLToPath(new URL('../../../../', import.meta.url))
    await mkdir(join(root, 'ts'))
    for (const entry of ['agent', 'dev', 'ts/CLIs', 'ts/shared', 'ts/tsconfig.json', 'ts/tsconfig.base.json']) {
      await cp(join(repository, entry), join(root, entry), { recursive: true })
    }
    await symlink(join(repository, 'ts/node_modules'), join(root, 'ts/node_modules'))
    const script = join(root, 'ts/probe.ts')
    let invocation = 0
    await work(async (source, agent = false, args = []) => {
      const log = join(root, '.artifacts/logs/agent', `${invocation++}.log`)
      await Bun.write(
        script,
        `import { IO, runCommand } from '@cli-kit'
import { registerCommand as registeredAction } from './CLIs/CLIs-src/dev-cli/commands/_command-runner'
${source}`,
      )
      const child = Bun.spawn([process.execPath, script, ...args], {
        cwd: join(root, 'ts'),
        env: { ...process.env, TAO_AGENT: agent ? '1' : '0', TAO_AGENT_LOG: log, TAO_DEBUG_ERRORS: '0' },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      return { code, stdout, stderr, log: await Bun.file(log).exists() ? await readFile(log, 'utf8') : '' }
    }, root)
  }, { finally: () => rm(root, { recursive: true, force: true }) })
}

function commandAction(expression: string): string {
  return `await registeredAction({ name: 'run', description: 'Command probe.', action: async () => { await ${expression} } }).action()`
}

Describe('command IO', () => {
  Test('awaits variadic void steps in order and stops at the original thrown failure', async () => {
    const events: string[] = []
    const failure = new Error('step failed')
    const caught = await Try(() =>
      runSteps(
        async () => {
          events.push('first')
          await Promise.resolve()
          events.push('finished')
        },
        () => {
          events.push('second')
          throw failure
        },
        () => {
          events.push('third')
        },
      ), { catch: error => error })
    Expect(caught).toBe(failure)
    Expect(events).toEqual(['first', 'finished', 'second'])
    Expect(await runSteps(() => {}, async () => {})).toBeUndefined()
  })

  Test('routes developer output to terminal and agent messages to file while mirroring stderr', async () => {
    await withProbe(async run => {
      const source = `IO.info('hello %s', 'world'); IO.debug({ value: 3 }); IO.log('message');
IO.warn('warning'); IO.error('failure'); IO.stderr('raw stderr');`
      const dev = await run(source)
      const agent = await run(source, true)
      Expect(dev.code).toBe(0)
      Expect(dev.stdout).toBe('hello world\n{ value: 3 }\nmessage\n')
      Expect(dev.stderr).toBe('warning\nfailure\nraw stderr')
      Expect(dev.log).toBe('')
      Expect(agent.code).toBe(0)
      Expect(agent.stdout).toBe('')
      Expect(agent.stderr).toBe(dev.stderr)
      Expect(agent.log).toBe(dev.stdout + dev.stderr)
    })
  })

  Test('splits simple strings, preserves argv arrays and reports elapsed time after nonzero exits', async () => {
    await withProbe(async (run, root) => {
      const child = join(root, 'args.ts')
      await Bun.write(child, `await Bun.write(Bun.stdout, JSON.stringify(Bun.argv.slice(2)) + '\\n'); process.exit(23)`)
      const simple = await run(commandAction(`runCommand(process.execPath + ' ${child} first   second')`))
      Expect(simple.code).toBe(23)
      Expect(simple.stdout).toContain('["first","second"]\n')
      Expect(simple.stdout).toStartWith(`RUN CMD: ${process.execPath} ${child} first second\n`)
      Expect(simple.stdout).toMatch(/\[\d+\.\d{2}s\] \(.+\)\n$/)
      const array = await run(
        commandAction(`runCommand([process.execPath, '${child}', 'two words', '"quoted"'])`),
      )
      Expect(array.code).toBe(23)
      Expect(array.stdout).toContain(JSON.stringify(['two words', '"quoted"']))
      const agent = await run(commandAction(`runCommand([process.execPath, '${child}', 'agent'])`), true)
      Expect(agent.code).toBe(23)
      Expect(agent.stdout).toBe('["agent"]\n')
      Expect(agent.log).toMatch(/^RUN CMD: .+\n\[\d+\.\d{2}s\] \(.+\)\nCommand failed:/)
    })
  })

  Test('drains complete child stderr to terminal and log even for ignored probes', async () => {
    await withProbe(async (run, root) => {
      const child = join(root, 'stderr.ts')
      const payload = 'error chunk\n'.repeat(20000)
      await Bun.write(child, `await Bun.write(Bun.stderr, ${JSON.stringify(payload)}); process.exit(17)`)
      const result = await run(
        commandAction(`runCommand([process.execPath, '${child}'], { stderr: 'ignore' })`),
        true,
      )
      Expect(result.code).toBe(17)
      Expect(result.stderr.startsWith(payload)).toBe(true)
      Expect(result.stderr.slice(payload.length)).toContain('Command failed:')
      Expect(result.log.includes(payload)).toBe(true)
      Expect(result.log).toMatch(/\[\d+\.\d{2}s\] \(.+\)\nCommand failed:/)
      const dev = await run(commandAction(`runCommand([process.execPath, '${child}'], { stderr: 'ignore' })`))
      Expect(dev.stderr).not.toContain('error chunk')
      Expect(dev.stderr).toContain('Command failed:')
    })
  })

  Test('records spawn failures and the shared error boundary and Commander diagnostics', async () => {
    await withProbe(async run => {
      const setup = `import { registerCommand, execute } from './CLIs/CLIs-src/dev-cli/commands/_command-runner'
registerCommand({ name: 'probe', description: 'Probe.', action: async () => await runCommand('missing-tao-command-io-tool') })
await execute()`
      const failed = await run(setup, true, ['probe'])
      Expect(failed.code).toBe(1)
      Expect(failed.stdout).toBe('')
      Expect(failed.stderr).toContain('missing-tao-command-io-tool')
      Expect(failed.log).toContain(failed.stderr)
      Expect(failed.log).toContain('RUN CMD: missing-tao-command-io-tool\n')
      Expect(failed.log).toMatch(/\[\d+\.\d{2}s\] \(missing-tao-command-io-tool\)/)
      const usage = await run(setup, true, ['unknown'])
      Expect(usage.code).toBe(1)
      Expect(usage.log).toBe(usage.stderr)
      Expect(usage.stderr).toContain("unknown command 'unknown'")
    })
  })

  Test('retains command verdicts and readable errors when the log file is unavailable', async () => {
    await withProbe(async (run, root) => {
      const invalidLog = `process.env.TAO_AGENT_LOG = ${JSON.stringify(join(root, 'ts'))}`
      const command = await run(
        `${invalidLog}
IO.info('fallback info'); IO.error('visible error');
${commandAction("runCommand([process.execPath, '-e', 'process.exit(17)'])")}`,
        true,
      )
      Expect(command.code).toBe(17)
      Expect(command.stdout).toContain('fallback info\nRUN CMD: ')
      Expect(command.stdout).toMatch(/\[\d+\.\d{2}s\]/)
      Expect(command.stderr).toContain('visible error\n')
      Expect(command.stderr.match(/Agent log unavailable:/g)).toHaveLength(1)
      const failure = await run(
        `${invalidLog}
import { registerCommand } from './CLIs/CLIs-src/dev-cli/commands/_command-runner'
await registerCommand({ name: 'fail', description: 'Failure.', action: () => { throw new Error('original failure') } }).action()`,
        true,
      )
      Expect(failure.code).toBe(1)
      Expect(failure.stderr).toContain('original failure\n')
      Expect(failure.stderr.match(/Agent log unavailable:/g)).toHaveLength(1)
    })
  })
})
