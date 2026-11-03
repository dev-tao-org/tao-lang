import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Processes, Repo, Text } from '@shared/os'
import { outputFixturePath } from './output.test-fixtures'

const LogPathRegx = /Logs: (.+?\.log)/

Tests.test('dashboard prompts retain concurrent setup and subprocess output inside Ink panes and hide secret pastes', async () => {
  const result = await Processes.runIgnoreStatus(['bun', 'run', outputFixturePath, 'pane-interactive'], {
    cwd: Repo.getWorkspaceRoot(),
    addEnv: { TERMINAL_UI: '0', TERMINAL_OUTPUT: '1', CLI_OUTPUT_EVENTS: undefined },
  })
  Tests.expect(result.status).toBe(0)
  Tests.expect(result.stdout.startsWith('PANES' + NewlineCharacter)).toBe(true)
  const visible = Text.stripAnsi(result.stdout)
  Tests.expect(visible).toContain('pane input completed')
  for (
    const message of [
      'Managed npm declarations changed',
      'shard stdout completed',
      'shard stderr completed',
      '[Y/n]',
      'Answer yes or no.',
      'Fixture hidden token:',
    ]
  ) {
    const matching = visible.split(NewlineCharacter).filter(line => line.includes(message))
    Tests.expect(matching.length).toBeGreaterThan(0)
    Tests.expect(matching.every(line => line.startsWith('│') && line.endsWith('│'))).toBe(true)
  }
  Tests.expect(visible).not.toContain('private')
  Tests.expect(visible).not.toContain('value')
  Tests.expect(result.stderr).not.toContain('Logs:')
  Tests.expect(result.stderr).not.toContain('shard stdout')
  Tests.expect(result.stderr).not.toContain('shard stderr')
  const logPath = LogPathRegx.exec(visible)?.[1]?.trim()
  Tests.expect(logPath).toBeDefined()
  const log = await FS.readFile(Repo.resolvePath(logPath!), 'utf8')
  Tests.expect(log).toContain('[info stdout] [TypeScript shard 2] shard stdout ')
  Tests.expect(log).toContain('[info stderr] [TypeScript shard 2] shard stderr completed')
  Tests.expect(log).toContain('Set up dependencies and continue?')
  Tests.expect(log).not.toContain('private')
  Tests.expect(log).not.toContain('value')
})
