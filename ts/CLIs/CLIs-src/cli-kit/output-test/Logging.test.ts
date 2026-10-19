import { Env, FileSystem, Platform, Repo, Tests } from '@shared/os'
import { outputFixturePath } from './OutputFixture'

Tests.test('agent logs preserve levels, nested warnings and stderr while terminal notices stay concise', async () => {
  for (const [mode, terminalOutput] of [['parent', undefined], ['failed', undefined], ['parent', '1']] as const) {
    const { status, stdout, stderr } = await runFixture(mode, terminalOutput)
    const logPath = /Logs: (.+\.log)/.exec(stderr)?.[1]
    Tests.expect(logPath).toBeDefined()
    const log = await FileSystem.readFile(Repo.resolvePath(logPath!), 'utf8')
    Tests.expect(log).toContain('[info stderr] [tool] ordinary tool stderr')
    Tests.expect(log).toContain('[warn stdout]')
    Tests.expect(stderr).toContain('2 warning(s)')
    if (!terminalOutput) {
      const completed = stderr.search(/(?:Completed|Failed): 2 warning\(s\)/)
      const details = stderr.slice(completed)
      Tests.expect(completed).toBeGreaterThanOrEqual(0)
      Tests.expect(details.match(/^Warning: /gm)?.length).toBe(2)
      Tests.expect(details).toContain('fixture warning at /tmp/fixture.ts:12')
      Tests.expect(details).not.toContain('\u001b[')
    }
    Tests.expect(stdout).not.toContain('\u001e')
    Tests.expect(stdout).toContain('fixture result')
    Tests.expect(status).toBe(mode === 'failed' ? 1 : 0)
    if (terminalOutput) {
      Tests.expect(stdout).toContain('fixture routine details')
    } else {
      Tests.expect(stdout + stderr).not.toContain('ordinary tool stderr')
      Tests.expect(stdout).not.toContain('fixture routine details')
    }
    if (mode === 'failed') {
      Tests.expect(stderr).toMatch(/Failed: 2 warning\(s\), [1-9]\d* error\(s\)/)
      Tests.expect(stderr).toContain('Error recorded:')
      Tests.expect(log).toContain('[error stderr]')
      Tests.expect(log).toContain('fixture failure')
    } else {
      Tests.expect(stderr).toContain('0 error(s)')
    }
  }
})

Tests.test('delegated developer commands retain the agent quiet default and print warning notices', async () => {
  const { status, stdout, stderr } = await runFixture('delegate')
  Tests.expect(status).toBe(0)
  Tests.expect(stdout).toContain('fixture result')
  Tests.expect(stdout + stderr).not.toContain('fixture routine details')
  Tests.expect(stdout + stderr).not.toContain('ordinary tool stderr')
  Tests.expect(stderr).toContain('Completed: 1 warning(s), 0 error(s)')
})

Tests.test('IO prompt suspends and recreates its configured renderer', async () => {
  const { status, stdout } = await runFixture('prompt-lifecycle')
  Tests.expect(status).toBe(0)
  Tests.expect(stdout).toContain('create,dispose,prompt,create')
})

async function runFixture(mode: string, terminalOutput?: string) {
  const child = Platform.spawn('bun run', {
    variadicArgs: [outputFixturePath, mode],
    cwd: Repo.getWorkspaceRoot(),
    env: { ...Env.snapshot(), TERMINAL_OUTPUT: terminalOutput, TERMINAL_UI: '0', CLI_OUTPUT_EVENTS: undefined },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  return { status, stdout, stderr }
}
