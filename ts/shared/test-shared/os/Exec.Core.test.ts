import { Errors, NewlineCharacter, S } from '@shared'
import * as Tests from '@shared-tests'
import { Env, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

const ProbeSource = S`
  const input = await Bun.stdin.text();
  process.stdout.write([process.cwd(), process.env.TAO_PROCESS_PROBE, process.env.PATH, process.env.TAO_PROCESS_UNSET === undefined, process.argv[1], input].join('|'));
`

Tests.test('command execution preserves argument boundaries, environment, cwd and stdin', async () => {
  const cwd = Repo.getWorkspaceRoot()
  const addEnv = { TAO_PROCESS_PROBE: 'present', TAO_PROCESS_UNSET: undefined }
  const args = ['-e', ProbeSource, 'with spaces'] as const
  const options = { cwd, addEnv, stdin: 'payload' }
  const asynchronous = await Exec.capture('bun', args, options)
  const synchronous = Exec.runSync('bun', args, options)
  for (const result of [asynchronous, synchronous]) {
    Tests.expect(result.status).toBe(0)
    Tests.expect(result.signal).toBe(null)
    Tests.expect(result.cwd).toBe(cwd)
    Tests.expect(result.args).toEqual(args)
    Tests.expect(result.stdout).toBe(`${cwd}|present|${Env.get('PATH') ?? ''}|true|with spaces|payload`)
    Tests.expect(result.stderr).toBe('')
  }
})

Tests.test('command strings name one executable and positional strings supply fixed arguments', async () => {
  const version = await Exec.captureStdout('bun', '  --version\t ')
  Tests.expect(version).toBe(await Exec.captureStdout('bun', ['--version']))
  await Tests.rejects(() => Exec.capture('bun --version'), isCommandStartFailure)
})

Tests.test('command execution preserves binary stdin without text decoding', async () => {
  const source = 'process.stdout.write([...new Uint8Array(await Bun.stdin.arrayBuffer())].join(","))'
  const options = { stdin: new Uint8Array([0, 255, 128]) }
  const asynchronous = await Exec.capture('bun', ['-e', source], options)
  const synchronous = Exec.runSync('bun', ['-e', source], options)
  Tests.expect(asynchronous.stdout).toBe('0,255,128')
  Tests.expect(synchronous.stdout).toBe('0,255,128')
})

const NonzeroSource = S`
  process.stdout.write(' output\\n');
  process.stderr.write('diagnostic\\n');
  process.exit(7);
`

Tests.test('commands throw by default and preserve nonzero results only through the explicit opt-out', async () => {
  const args = ['-e', NonzeroSource]
  const asynchronous = await Exec.capture('bun', args, { check: false })
  const synchronous = Exec.runSync('bun', args, { check: false })
  for (const result of [asynchronous, synchronous]) {
    Tests.expect(result).toMatchObject({
      status: 7,
      signal: null,
      stdout: ' output' + NewlineCharacter,
      stderr: 'diagnostic' + NewlineCharacter,
    })
    Tests.expect(result.command).toBe('bun')
    Tests.expect(result.args).toEqual(['-e', NonzeroSource])
  }
  await Tests.rejects(() => Exec.capture('bun', args), isNonzeroCommandFailure)
  Tests.throws(() => Exec.runSync('bun', args), isNonzeroCommandFailure)
})

function isNonzeroCommandFailure(error: unknown): boolean {
  if (!Errors.isCommandExecutionError(error)) {
    return false
  }
  Tests.expect(error.result).toMatchObject({
    command: 'bun',
    args: ['-e', NonzeroSource],
    status: 7,
    signal: null,
    stdout: ' output' + NewlineCharacter,
    stderr: 'diagnostic' + NewlineCharacter,
  })
  return true
}

Tests.test('ignoring exit status still throws structured failures when a command cannot start', async () => {
  const missing = Path.join(Repo.getWorkspaceRoot(), '.artifacts', Platform.randomUUID(), 'missing-command')
  await Tests.rejects(() => Exec.capture(missing, { check: false }), isCommandStartFailure)
  Tests.throws(() => Exec.runSync(missing, { check: false }), isCommandStartFailure)
})

function isCommandStartFailure(error: unknown): boolean {
  if (!Errors.isCommandExecutionError(error)) {
    return false
  }
  Tests.expect(error.result.status).toBe(null)
  Tests.expect(error.result.signal).toBe(null)
  Tests.expect(error.result.stdout).toBe('')
  Tests.expect(error.result.stderr).toBe('')
  Tests.expect(Errors.isNativeError(error.result.error)).toBe(true)
  return true
}

Tests.test('command deadlines force termination and preserve the explicit status policy', async () => {
  const source = 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'
  const args = ['-e', source]
  const options = { timeoutMs: 100 }
  const asynchronous = await Exec.capture('bun', args, { ...options, check: false })
  const synchronous = Exec.runSync('bun', args, { ...options, check: false })
  Tests.expect(asynchronous.signal).toBe('SIGKILL')
  Tests.expect(synchronous.signal).toBe('SIGKILL')
  await Tests.rejects(() => Exec.capture('bun', args, options), isDeadlineCommandFailure)
  Tests.throws(() => Exec.runSync('bun', args, options), isDeadlineCommandFailure)
})

function isDeadlineCommandFailure(error: unknown): boolean {
  return Errors.isCommandExecutionError(error) && error.result.signal === 'SIGKILL'
}
