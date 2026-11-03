import { Errors, NewlineCharacter, S } from '@shared'
import * as Tests from '@shared-tests'
import { Env, Path, Platform, Repo } from '@shared/os'
import * as Processes from '../../../shared-src/os/Processes'

const ProbeSource = S`
  const input = await Bun.stdin.text();
  process.stdout.write([process.cwd(), process.env.TAO_PROCESS_PROBE, process.env.PATH, process.env.TAO_PROCESS_UNSET === undefined, process.argv[1], input].join('|'));
`

Tests.test('command execution preserves argument boundaries, environment, cwd and stdin', async () => {
  const cwd = Repo.getWorkspaceRoot()
  const addEnv = { TAO_PROCESS_PROBE: 'present', TAO_PROCESS_UNSET: undefined }
  const options = { variadicArgs: ['-e', ProbeSource, 'with spaces'], cwd, addEnv, stdin: 'payload' }
  const command = ['bun']
  const asynchronous = await Processes.run(command, options)
  const synchronous = Processes.runSync(command, options)
  for (const result of [asynchronous, synchronous]) {
    Tests.expect(result.status).toBe(0)
    Tests.expect(result.signal).toBe(null)
    Tests.expect(result.cwd).toBe(cwd)
    Tests.expect(result.args).toEqual(options.variadicArgs)
    Tests.expect(result.stdout).toBe(`${cwd}|present|${Env.get('PATH') ?? ''}|true|with spaces|payload`)
    Tests.expect(result.stderr).toBe('')
  }
})

Tests.test('command execution preserves binary stdin without text decoding', async () => {
  const source = 'process.stdout.write([...new Uint8Array(await Bun.stdin.arrayBuffer())].join(","))'
  const options = { stdin: new Uint8Array([0, 255, 128]) }
  const asynchronous = await Processes.run(['bun', '-e', source], options)
  const synchronous = Processes.runSync(['bun', '-e', source], options)
  Tests.expect(asynchronous.stdout).toBe('0,255,128')
  Tests.expect(synchronous.stdout).toBe('0,255,128')
})

const NonzeroSource = S`
  process.stdout.write(' output\\n');
  process.stderr.write('diagnostic\\n');
  process.exit(7);
`

Tests.test('commands throw by default and preserve nonzero results only through the explicit opt-out', async () => {
  const command = ['bun', '-e', NonzeroSource]
  const asynchronous = await Processes.runIgnoreStatus(command)
  const synchronous = Processes.runIgnoreStatusSync(command)
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
  await Tests.rejects(() => Processes.run(command), isNonzeroCommandFailure)
  Tests.throws(() => Processes.runSync(command), isNonzeroCommandFailure)
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
  const command = [missing]
  await Tests.rejects(() => Processes.runIgnoreStatus(command), isCommandStartFailure)
  Tests.throws(() => Processes.runIgnoreStatusSync(command), isCommandStartFailure)
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
  const command = ['bun', '-e', source]
  const options = { timeoutMs: 100 }
  const asynchronous = await Processes.runIgnoreStatus(command, options)
  const synchronous = Processes.runIgnoreStatusSync(command, options)
  Tests.expect(asynchronous.signal).toBe('SIGKILL')
  Tests.expect(synchronous.signal).toBe('SIGKILL')
  await Tests.rejects(() => Processes.run(command, options), isDeadlineCommandFailure)
  Tests.throws(() => Processes.runSync(command, options), isDeadlineCommandFailure)
})

function isDeadlineCommandFailure(error: unknown): boolean {
  return Errors.isCommandExecutionError(error) && error.result.signal === 'SIGKILL'
}
