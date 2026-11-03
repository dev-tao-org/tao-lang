import { NewlineCharacter } from '@shared'
import { FileSystem, Platform, Repo, Tests, Text } from '@shared/os'
import { outputFixturePath } from './OutputFixture'

const LogPathRegx = /Logs: (.+?\.log)/

Tests.test('dashboard prompts and failure completion retain all output in Ink panes and hide secret pastes', async () => {
  const result = await Platform.runIgnoreStatus(['bun', 'run', outputFixturePath, 'pane-interactive'], {
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
      'fixture completion warning',
      'fixture worker failure',
      'Failed: 1 warning(s), 1 error(s)',
    ]
  ) {
    const matching = visible.split(NewlineCharacter).filter(line => line.includes(message))
    Tests.expect(matching.length).toBeGreaterThan(0)
    Tests.expect(matching.every(line => line.startsWith('│') && line.endsWith('│'))).toBe(true)
  }
  Tests.expect(visible).not.toContain('private')
  Tests.expect(visible).not.toContain('value')
  Tests.expect(result.stderr).toBe('')
  const logPath = LogPathRegx.exec(visible)?.[1]?.trim()
  Tests.expect(logPath).toBeDefined()
  const log = await FileSystem.readFile(Repo.resolvePath(logPath!), 'utf8')
  Tests.expect(log).toContain('[info stdout] [TypeScript shard 2] shard stdout ')
  Tests.expect(log).toContain('[info stderr] [TypeScript shard 2] shard stderr completed')
  Tests.expect(log).toContain('Set up dependencies and continue?')
  Tests.expect(log).not.toContain('private')
  Tests.expect(log).not.toContain('value')
})
