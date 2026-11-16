import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Repo, Text } from '@shared/os'
import Exec from '@shared/os/exec'
import { outputFixturePath } from './output.test-fixtures'
import { PaneSecretLines } from './output.test-fixtures.Panes'

const LogPathRegx = /Logs: (.+?\.log)/

Tests.test('dashboard prompts and failure completion retain all output in Ink panes and hide secret pastes', async () => {
  const result = await Exec.capture('bun', ['run', outputFixturePath, 'pane-interactive'], {
    check: false,
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
  Tests.expect(result.stderr).toBe('')
  const logPath = LogPathRegx.exec(visible)?.[1]?.trim()
  Tests.expect(logPath).toBeDefined()
  expectFinalRecoveryNotice(visible, logPath!)
  const log = await FS.readFile(Repo.resolvePath(logPath!), 'utf8')
  Tests.expect(log).toContain('[info stdout] [TypeScript shard 2] shard stdout ')
  Tests.expect(log).toContain('[info stderr] [TypeScript shard 2] shard stderr completed')
  Tests.expect(log).toContain('Set up dependencies and continue?')
  for (const line of PaneSecretLines) {
    Tests.expect(visible).not.toContain(line)
    Tests.expect(log).not.toContain(line)
  }
})

function expectFinalRecoveryNotice(visible: string, logPath: string): void {
  const finalFrame = visible.split('FINAL' + NewlineCharacter)[1]!
  const lines = finalFrame.split(NewlineCharacter)
  Tests.expect(lines.length).toBeLessThanOrEqual(12)
  Tests.expect(lines.every(line => line.length <= 80)).toBe(true)
  const contentLines = lines.filter(line => line.startsWith('│'))
  const contents = contentLines.map(line => line.slice(1, -1).trim()).join('')
  Tests.expect(contents).toContain('Failed: 1 warning(s), 1 error(s). Logs:')
  Tests.expect(contents).toContain(logPath)
}
