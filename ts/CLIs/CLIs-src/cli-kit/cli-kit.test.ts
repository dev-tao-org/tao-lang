import { S, Try } from '@shared'
import { Env, FileSystem, Platform } from '@shared/os'
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from '@shared/os/FileSystem'
import { fileURLToPath, join } from '@shared/os/Path'
import { tmpdir } from '@shared/os/Platform'
import { describe as Describe, expect as Expect, test as Test } from '@shared/os/Test'
import { runSteps } from './cli-kit'

type Result = { code: number; stdout: string; stderr: string; log: string }

Describe('command IO', () => {
  Test('prints complete aggregate failures with yellow stacks before red details in terminal and log', async () => {
    await withProbe(async run => {
      const source = S`
        const member = new Error('aggregate-member')
        const failure = new AggregateError([member, ...Array.from({ length: 105 }, (_, index) => 'entry-' + index)], 'x'.repeat(12000) + 'message-tail')
        member.cause = failure
        throw failure
      `
      const result = await run(source, true)
      Expect(result.code).toBe(1)
      Expect(result.stdout).toBe('')
      Expect(result.stderr).toContain('message-tail')
      Expect(result.stderr).toContain('aggregate-member')
      Expect(result.stderr).toContain('entry-104')
      Expect(result.stderr).toContain('[Circular error cause]')
      Expect(result.stderr).toMatch(/\u001b\[33m[\s\S]+\u001b\[0m\n\u001b\[31m/)
      Expect(result.log).toBe(result.stderr)
    })
  })

  Test('awaits variadic void steps in order and stops at the original thrown failure', async () => {
    const events: string[] = []
    const failure = new Error('step failed')
    await Expect(
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
      ),
    ).rejects.toBe(failure)
    Expect(events).toEqual(['first', 'finished', 'second'])
    Expect(await runSteps(() => {}, async () => {})).toBeUndefined()
  })

  Test('routes developer output to terminal and agent messages to file while mirroring stderr', async () => {
    await withProbe(async run => {
      const source = S`
        IO.info('hello %s', 'world'); IO.debug({ value: 3 }); IO.log('message');
        IO.warn('warning'); IO.error('failure'); IO.stderr('raw stderr');
      `
      const dev = await run(source)
      const agent = await run(source, true)
      Expect(dev.code).toBe(0)
      Expect(dev.stdout).toBe('hello world\n{ value: 3 }\nmessage\n')
      Expect(dev.stderr).toBe('warning\nfailure\nraw stderr')
      Expect(dev.log).toBe('')
      Expect(agent.code).toBe(0)
      Expect(agent.stdout).toBe('')
      Expect(agent.stderr).toBe('Logs: .artifacts/logs/agent/\n' + dev.stderr)
      Expect(agent.log).toBe('Logs: .artifacts/logs/agent/\n' + dev.stdout + dev.stderr)
    })
  })

  Test(
    'splits command strings, appends variadic arguments unchanged, and preserves argv arrays and exit status',
    async () => {
      await withProbe(async (run, root) => {
        const child = join(root, 'args.ts')
        await FileSystem.write(
          child,
          `await Bun.write(Bun.stdout, JSON.stringify(Bun.argv.slice(2)) + '\\n'); process.exit(23)`,
        )
        const simple = await run(commandAction(
          `runCommand('bun ${child} first   second', { variadicArgs: ['two words', '', '"quoted"', '$literal', '--flag=value'] })`,
        ))
        Expect(simple.code).toBe(23)
        Expect(simple.stdout).toContain('["first","second","two words","","\\"quoted\\"","$literal","--flag=value"]\n')
        Expect(simple.stdout).toStartWith(`RUN CMD: bun ${child} first second two words `)
        Expect(simple.stdout).toMatch(/\[\d+\.\d{2}s\] \(.+\)\n$/)
        const array = await run(
          commandAction(`runCommand(['bun', '${child}', 'two words'], { variadicArgs: ['"quoted"'] })`),
        )
        Expect(array.code).toBe(23)
        Expect(array.stdout).toContain(JSON.stringify(['two words', '"quoted"']))
        const agent = await run(commandAction(`runCommand('bun ${child}', { variadicArgs: ['agent'] })`), true)
        Expect(agent.code).toBe(23)
        Expect(agent.stdout).toBe('')
        Expect(agent.log).toContain('["agent"]\n')
        Expect(agent.log).toMatch(/RUN CMD: .+\n\["agent"\]\n\[\d+\.\d{2}s\] \(.+\)\n\u001b\[33m/)
      })
    },
  )

  Test('drains complete child streams, logging stdout and mirroring stderr even for ignored probes', async () => {
    await withProbe(async (run, root) => {
      const child = join(root, 'stderr.ts')
      const payload = '#'.repeat(90000) + '\n'
      const stdoutPayload = '@'.repeat(90000) + '\n'
      await FileSystem.write(
        child,
        `await Promise.all([Bun.write(Bun.stderr, ${JSON.stringify(payload)}), Bun.write(Bun.stdout, ${
          JSON.stringify(stdoutPayload)
        })]); process.exit(17)`,
      )
      const result = await run(
        commandAction(`runCommand(['bun', '${child}'], { stderr: 'ignore' })`),
        true,
      )
      Expect(result.code).toBe(17)
      Expect(result.stdout).toBe('')
      Expect(result.stderr.startsWith('Logs: .artifacts/logs/agent/\n' + payload)).toBe(true)
      Expect(result.stderr).toContain('Command failed:')
      Expect(result.log.split('#').length - 1).toBe(90000)
      Expect(result.log.split('@').length - 1).toBe(90000)
      Expect(result.log).toMatch(/\[\d+\.\d{2}s\] \(.+\)\n\u001b\[33m/)
      const dev = await run(commandAction(`runCommand(['bun', '${child}'], { stderr: 'ignore' })`))
      Expect(dev.stderr).not.toContain('#')
      Expect(dev.stderr).toContain('Command failed:')
    })
  })

  Test('records spawn failures through the shared error boundary', async () => {
    await withProbe(async run => {
      const setup = S`
        import { registerCommand, execute } from './CLIs/CLIs-src/dev-cli/commands/_command-runner'
        registerCommand({ name: 'probe', description: 'Probe.', action: async () => await runCommand('missing-tao-command-io-tool') })
        await execute()
      `
      const failed = await run(setup, true, ['probe'])
      Expect(failed.code).toBe(1)
      Expect(failed.stdout).toBe('')
      Expect(failed.stderr).toContain('missing-tao-command-io-tool')
      Expect(failed.log).toContain(failed.stderr.split('\n').slice(1).join('\n'))
      Expect(failed.log).toContain('RUN CMD: missing-tao-command-io-tool\n')
      Expect(failed.log).toMatch(/\[\d+\.\d{2}s\] \(missing-tao-command-io-tool\)/)
    })
  })

  Test('retains command verdicts and readable errors when the log file is unavailable', async () => {
    await withProbe(async (run, root) => {
      const invalidLog = `process.env.TAO_AGENT_LOG = ${JSON.stringify(join(root, 'ts'))}`
      const command = await run(
        S`
          ${invalidLog}
          IO.info('fallback info'); IO.error('visible error');
          ${commandAction("runCommand(['bun', '-e', 'process.exit(17)'])")}
        `,
        true,
      )
      Expect(command.code).toBe(17)
      Expect(command.stdout).toContain('fallback info\nRUN CMD: ')
      Expect(command.stdout).toMatch(/\[\d+\.\d{2}s\]/)
      Expect(command.stderr).toContain('visible error\n')
      Expect(command.stderr.match(/Command log unavailable:/g)).toHaveLength(1)
      const failure = await run(
        S`
          ${invalidLog}
          import { registerCommand } from './CLIs/CLIs-src/dev-cli/commands/_command-runner'
          await registerCommand({ name: 'fail', description: 'Failure.', action: () => { throw new Error('original failure') } }).action()
        `,
        true,
      )
      Expect(failure.code).toBe(1)
      Expect(failure.stderr).toContain("message: 'original failure'")
      Expect(failure.stderr.match(/Command log unavailable:/g)).toHaveLength(1)
    })
  })

  Test('logs developer child stdout, mirrors stderr, and announces the relative directory only once', async () => {
    await withProbe(async run => {
      const result = await run(S`
        await runCommand(['bun', '-e', 'console.log("stdout payload"); console.error("stderr payload")'], { stdout: 'log' })
        await runCommand(['bun', '-e', 'console.log("second payload")'], { stdout: 'log' })
      `)
      Expect(result.code).toBe(0)
      Expect(result.stdout).toBe('')
      Expect(result.stderr).toBe('Logs: .artifacts/logs/agent/\nstderr payload\n')
      Expect(result.log).toContain('stdout payload\n')
      Expect(result.log).toContain('stderr payload\n')
      Expect(result.log).toContain('second payload\n')
      Expect(result.log.match(/Logs:/g)).toHaveLength(1)
      Expect(result.log.match(/RUN CMD:/g)).toHaveLength(2)
    })
  })

  Test('reports slow tests after failed runs and preserves their failure when timing data is unavailable', async () => {
    await withProbe(async run => {
      for (const reportState of ['available', 'missing', 'blocked']) {
        const writeReport = reportState === 'available'
          ? 'await Bun.write(reportPath, \'<testsuite name="suite"><testcase name="slow" time="0.25" /></testsuite>\')'
          : ''
        const blockReport = reportState === 'blocked'
          ? "await Bun.write(new URL('../.artifacts/logs/test', import.meta.url), 'blocked')"
          : ''
        const source = S`
          import { withTestTimings } from './CLIs/CLIs-src/cli-kit/slow-tests'
          import { Errors } from '@shared'
          import { rm } from 'node:fs/promises'
          await rm(new URL('../.artifacts/logs/test', import.meta.url), { recursive: true, force: true })
          ${blockReport}
          await registeredAction({ name: 'test', description: 'Timing probe.', action: async () => {
            await withTestTimings(async reportPath => {
              ${writeReport}
              IO.stderr('tests completed\\n')
              Errors.ThrowCommandExecution({ command: 'test-fixture', args: [], status: 23, signal: null, stdout: '', stderr: '' })
            })
          } }).action()
        `
        const result = await run(source, true)
        Expect(result.code).toBe(23)
        Expect(result.stderr).toContain('Command failed: test-fixture')
        if (reportState === 'available') {
          Expect(result.stderr).toContain('\u001b[33mSlow tests (>75 ms):\u001b[0m')
          Expect(result.stderr.indexOf('tests completed')).toBeLessThan(result.stderr.indexOf('Slow tests'))
          Expect(result.log).toContain('250.00 ms  suite > slow')
        } else if (reportState === 'missing') {
          Expect(result.stderr).toContain('Unable to read test timings:')
        } else {
          Expect(result.stderr).toContain('Test timing report unavailable:')
          Expect(result.stderr).toContain('tests completed')
        }
      }
    })
  })
})

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
      await FileSystem.write(
        script,
        S`
          import { IO, runCommand } from '@cli-kit'
          import './CLIs/CLIs-src/cli-kit/fatal-errors'
          import { registerCommand as registeredAction } from './CLIs/CLIs-src/dev-cli/commands/_command-runner'
          ${source}
        `,
      )
      const child = Platform.spawn(['bun', script, ...args], {
        cwd: join(root, 'ts'),
        env: { ...Env, TAO_AGENT: agent ? '1' : '0', TAO_AGENT_LOG: log },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        Platform.readText(child.stdout),
        Platform.readText(child.stderr),
      ])
      return { code, stdout, stderr, log: await FileSystem.file(log).exists() ? await readFile(log, 'utf8') : '' }
    }, root)
  }, { finally: () => rm(root, { recursive: true, force: true }) })
}

function commandAction(expression: string): string {
  return `await registeredAction({ name: 'run', description: 'Command probe.', action: async () => { await ${expression} } }).action()`
}
