import * as Tests from '@shared-tests'
import { FS, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { outputFixturePath } from './output.test-fixtures'

const LogPathRegx = /Logs: (.+\.log)/
const WarningSummaryRegx = /(?:Completed|Failed): 2 warning\(s\)/
const WarningLineRegx = /^Warning: /gm
const FailedSummaryRegx = /Failed: 2 warning\(s\), [1-9]\d* error\(s\)/

Tests.test('agent logs preserve levels, nested warnings and stderr while terminal notices stay concise', async () => {
  for (const [mode, terminalOutput] of [['parent', undefined], ['failed', undefined], ['parent', '1']] as const) {
    const { status, stdout, stderr } = await runFixture(mode, terminalOutput)
    const logPath = LogPathRegx.exec(stderr)?.[1]
    Tests.expect(logPath).toBeDefined()
    const log = await FS.readFile(Repo.resolvePath(logPath!), 'utf8')
    Tests.expect(log).toContain('[info stderr] [tool] ordinary tool stderr')
    Tests.expect(log).toContain('[warn stdout]')
    Tests.expect(stderr).toContain('2 warning(s)')
    if (!terminalOutput) {
      const completed = stderr.search(WarningSummaryRegx)
      const details = stderr.slice(completed)
      Tests.expect(completed).toBeGreaterThanOrEqual(0)
      Tests.expect(details.match(WarningLineRegx)?.length).toBe(2)
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
      Tests.expect(stderr).toMatch(FailedSummaryRegx)
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

Tests.test('IO confirmation suspends and recreates its configured renderer', async () => {
  const { status, stdout } = await runFixture('prompt-lifecycle')
  Tests.expect(status).toBe(0)
  Tests.expect(stdout).toContain('create,dispose,prompt,create')
})

Tests.test('IO retries a renderer after disposal fails', async () => {
  const { status, stdout } = await runFixture('prompt-dispose-recovery')
  Tests.expect(status).toBe(0)
  Tests.expect(stdout).toContain('dispose 1,dispose 2,prompt 2,create 1')
})

Tests.test('IO retries renderer creation after prompt cleanup fails', async () => {
  const { status, stdout } = await runFixture('prompt-render-recovery')
  Tests.expect(status).toBe(0)
  Tests.expect(stdout).toContain('dispose 1,prompt 1,create 1,prompt 2,create 2')
})

Tests.test('batch commands cannot consume parent input under captured or delegated output', async () => {
  for (const mode of ['command-eof', 'command-eof-delegate']) {
    const result = await runFixture(mode, '1', 'parent input must remain private\n')
    Tests.expect(result.status).toBe(0)
    Tests.expect(result.stdout).toContain('command completed')
    Tests.expect(result.stdout + result.stderr).not.toContain('parent input must remain private')
  }
})

Tests.test('fatal command failures exit unsuccessfully while preserving nonzero command status', async () => {
  for (const [commandStatus, expectedStatus] of [['0', 1], ['null', 1], ['7', 7]] as const) {
    const result = await Exec.capture('bun', ['run', outputFixturePath, 'command-failure', commandStatus], {
      cwd: Repo.getWorkspaceRoot(),
      addEnv: { TERMINAL_UI: '0', TERMINAL_OUTPUT: '1', CLI_OUTPUT_EVENTS: undefined },
      check: false,
    })
    Tests.expect(result.status).toBe(expectedStatus)
    Tests.expect(result.stdout + result.stderr).toContain('Command failed: fixture')
  }
})

async function runFixture(mode: string, terminalOutput?: string, input = '') {
  const addEnv = {
    TERMINAL_OUTPUT: terminalOutput,
    TERMINAL_UI: '0',
    CLI_OUTPUT_EVENTS: undefined,
  }
  const child = Exec.spawn('bun', ['run', outputFixturePath, mode], {
    cwd: Repo.getWorkspaceRoot(),
    addEnv,
    stdin: 'pipe',
  })
  child.stdin.write(input)
  child.stdin.end()
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Exec.readText(child.stdout),
    Exec.readText(child.stderr),
  ])
  return { status, stdout, stderr }
}

Tests.test('native prompt suspension keeps concurrent setup and shard output owned by restored panes', async () => {
  const result = await runFixture('pane-routing', '1')
  Tests.expect(result.status).toBe(0)
  Tests.expect(result.stdout.startsWith('RESTORED PANES: ')).toBe(true)
  Tests.expect(result.stdout).toContain('Managed npm declarations changed')
  Tests.expect(result.stdout).toContain('worker partial completed')
  Tests.expect(result.stdout).toContain('worker stderr')
  Tests.expect(result.stdout).toContain('Set up dependencies and continue?')
  Tests.expect(result.stderr).not.toContain('[TypeScript shard 2] worker')
})
