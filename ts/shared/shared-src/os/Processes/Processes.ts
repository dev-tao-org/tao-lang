import * as ExternalErrors from '../../universal/Errors/external'
import { Errors, Regxs, Try } from '../../universal/universal'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import * as BunHost from '../bridges/Bridge_bun/Bridge_bun'
import * as Node from '../bridges/Bridge_node/Bridge_node'
import Env from '../Env'
import * as Process from '../Process'
import { collectCommand } from './Processes-Capture'

type SpawnOptions<
  In extends BunHost.SpawnOptions.Writable,
  Out extends BunHost.SpawnOptions.Readable,
  Err extends BunHost.SpawnOptions.Readable,
> = BunHost.SpawnOptions.SpawnOptions<In, Out, Err> & {
  variadicArgs?: readonly string[]
  addEnv?: EnvironmentOverrides
}
type SpawnCommand = string | readonly string[]
type SpawnOutputOption = 'stdout' | 'stderr' | 'stdio'
type NativeSpawnOption = SpawnOutputOption | 'env'
type NamedSpawnOptions<
  In extends BunHost.SpawnOptions.Writable,
  Out extends BunHost.SpawnOptions.Readable,
  Err extends BunHost.SpawnOptions.Readable,
> = Omit<SpawnOptions<In, Out, Err>, NativeSpawnOption> & {
  env?: never
  stdout?: never
  stderr?: never
  stdio?: never
}

/** ChildProcessInput describes supported standard-input sources for owned subprocesses. */
export type ChildProcessInput = BunHost.SpawnOptions.Writable
/** ChildProcess identifies an owned process handled by command supervision. */
export type ChildProcess = BunHost.Subprocess
/** PipedChildProcess owns captured output streams for one subprocess. */
export type PipedChildProcess<In extends ChildProcessInput = 'ignore'> = BunHost.Subprocess<In, 'pipe', 'pipe'>

/** spawnPiped starts a supervised child with both output streams piped to its owner. */
export function spawnPiped<const In extends BunHost.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'pipe', 'pipe'> = {},
): PipedChildProcess<In> {
  return spawn(command, { ...options, stdout: 'pipe', stderr: 'pipe' })
}

/** spawnStderrPiped starts a supervised child with standard error piped to its owner. */
export function spawnStderrPiped<const In extends BunHost.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'ignore', 'pipe'> = {},
): BunHost.Subprocess<In, 'ignore', 'pipe'> {
  return spawn(command, { ...options, stdout: 'ignore', stderr: 'pipe' })
}

/** spawnInherited starts a supervised child with both output streams inherited. */
export function spawnInherited<const In extends BunHost.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'inherit', 'inherit'> = {},
): BunHost.Subprocess<In, 'inherit', 'inherit'> {
  return spawn(command, { ...options, stdout: 'inherit', stderr: 'inherit' })
}

/** spawnStderrInherited starts a supervised child with standard error inherited. */
export function spawnStderrInherited<const In extends BunHost.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'ignore', 'inherit'> = {},
): BunHost.Subprocess<In, 'ignore', 'inherit'> {
  return spawn(command, { ...options, stdout: 'ignore', stderr: 'inherit' })
}

/** spawnStdoutInherited starts a supervised child with standard output inherited. */
export function spawnStdoutInherited<const In extends BunHost.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'inherit', 'ignore'> = {},
): BunHost.Subprocess<In, 'inherit', 'ignore'> {
  return spawn(command, { ...options, stdout: 'inherit', stderr: 'ignore' })
}

/** spawnSilent starts a supervised child with both output streams ignored. */
export function spawnSilent<const In extends BunHost.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'ignore', 'ignore'> = {},
): BunHost.Subprocess<In, 'ignore', 'ignore'> {
  return spawn(command, { ...options, stdout: 'ignore', stderr: 'ignore' })
}

type CommandStatus = number | null
type ProcessSignal = string | null
type EnvironmentValue = string | undefined
type ProcessEnvironment = Record<string, EnvironmentValue>
type EnvironmentOverrides = Readonly<ProcessEnvironment>
type ProcessInput = string | Uint8Array

/** CommandResult records the command and its complete, untrimmed process outcome. */
export type CommandResult<Status extends CommandStatus = CommandStatus> = {
  command: string
  args: readonly string[]
  cwd?: string
  status: Status
  signal: ProcessSignal
  stdout: string
  stderr: string
}
/** CompletedCommandResult records a successful command. */
export type CompletedCommandResult = CommandResult<0>
/** AsyncCommandResult records the numeric exit status returned by an asynchronous child. */
export type AsyncCommandResult = CommandResult<number>
/** RunOptions configures arguments, environment additions, input bytes and a termination deadline. */
export type RunOptions = {
  variadicArgs?: readonly string[]
  cwd?: string
  addEnv?: EnvironmentOverrides
  stdin?: ProcessInput
  timeoutMs?: number
}

/** run returns a completed command and throws a structured error on nonzero exit or a signal. */
export async function run(command: SpawnCommand, options: RunOptions = {}): Promise<CompletedCommandResult> {
  const result = await runIgnoreStatus(command, options)
  requireCommandSuccess(result)
  return result
}

/** runIgnoreStatus returns completed status, including deadline termination, and throws start or I/O failures. */
export async function runIgnoreStatus(command: SpawnCommand, options: RunOptions = {}): Promise<AsyncCommandResult> {
  const invocation = createInvocation(command, options)
  const spawnOptions = createCommandSpawnOptions(options)
  const argv = [invocation.command, ...invocation.args]
  const child = Try(() => spawnPiped(argv, spawnOptions), {
    catch: error => throwCommandFailure(invocation, error),
  })
  return await collectCommand(child, invocation, options)
}

/** runSync returns a synchronous command result and throws on nonzero exit or a signal. */
export function runSync(command: SpawnCommand, options: RunOptions = {}): CompletedCommandResult {
  const result = runIgnoreStatusSync(command, options)
  requireCommandSuccess(result)
  return result
}

/** runIgnoreStatusSync returns completed status, including deadline termination, and throws start or I/O failures. */
export function runIgnoreStatusSync(command: SpawnCommand, options: RunOptions = {}): CommandResult {
  const invocation = createInvocation(command, options)
  const spawnOptions = createCommandSyncOptions(options)
  const native = Try(() => Node.spawnSync(invocation.command, [...invocation.args], spawnOptions), {
    catch: error => throwCommandFailure(invocation, error),
  })
  const result = createCommandResult(
    invocation,
    native.status ?? null,
    native.signal ?? null,
    native.stdout ?? '',
    native.stderr ?? '',
  )
  if (native.error && !isDeadlineTermination(native.error, result)) {
    throwCommandFailure(invocation, native.error, result)
  }
  return result
}

function isDeadlineTermination(error: Error, result: CommandResult): boolean {
  if (result.signal !== 'SIGKILL') {
    return false
  }
  return 'code' in error && error.code === 'ETIMEDOUT'
}

/** terminate stops an owned child and waits for its process to exit. */
export async function terminate(child: BunHost.Subprocess): Promise<void> {
  child.kill('SIGKILL')
  await child.exited
}

/** readText consumes a child output stream without exposing the runtime reader. */
export async function readText(stream: WebHost.ReadableStream<Uint8Array>): Promise<string> {
  return new WebHost.Response(stream).text()
}

type CommandInvocationField = 'command' | 'args' | 'cwd'
/** CommandInvocation identifies the executable, arguments and working directory before execution. */
export type CommandInvocation = Pick<CommandResult, CommandInvocationField>
type CommandInputMode = 'pipe' | 'ignore'
function requireCommandSuccess(result: CommandResult): asserts result is CompletedCommandResult {
  if (result.status !== 0 || result.signal !== null) {
    Errors.ThrowCommandExecution(result)
  }
}

function throwCommandFailure(
  invocation: CommandInvocation,
  error: unknown,
  result: CommandResult = createCommandResult(invocation, null, null, '', ''),
): never {
  const cause = Errors.isNativeError(error) ? error : ExternalErrors.fromUnknown(error)
  Errors.ThrowCommandExecution({ ...result, error: cause })
}

function createInvocation(command: SpawnCommand, options: RunOptions): CommandInvocation {
  const [executable, ...args] = resolveCommandArguments(command, options.variadicArgs)
  if (!executable) {
    Errors.ThrowUserInput('A command is required.')
  }
  return { command: executable, args, cwd: options.cwd }
}

function createCommandSpawnOptions(options: RunOptions) {
  const stdin: CommandInputMode = options.stdin === undefined ? 'ignore' : 'pipe'
  return { cwd: options.cwd, addEnv: options.addEnv, stdin }
}

function createCommandSyncOptions(options: RunOptions) {
  return {
    cwd: options.cwd,
    env: resolveSpawnEnvironment({ addEnv: options.addEnv, stderr: 'pipe' }),
    encoding: 'utf8' as const,
    input: options.stdin,
    timeout: options.timeoutMs,
    killSignal: 'SIGKILL' as const,
  }
}

function createCommandResult<Status extends CommandStatus>(
  invocation: CommandInvocation,
  status: Status,
  signal: ProcessSignal,
  stdout: string,
  stderr: string,
): CommandResult<Status> {
  return { ...invocation, status, signal, stdout, stderr }
}

function resolveCommandArguments(command: SpawnCommand, variadicArgs: readonly string[] = []): string[] {
  const args = typeof command === 'string' ? command.trim().split(Regxs.SpacesRegx) : [...command]
  return [...args, ...variadicArgs]
}

function spawn<
  const In extends BunHost.SpawnOptions.Writable = 'ignore',
  const Out extends BunHost.SpawnOptions.Readable = 'pipe',
  const Err extends BunHost.SpawnOptions.Readable = 'inherit',
>(command: SpawnCommand, options: SpawnOptions<In, Out, Err> = {}): BunHost.Subprocess<In, Out, Err> {
  const { variadicArgs = [], addEnv, ...spawnOptions } = options
  const environment = resolveSpawnEnvironment({ addEnv, stderr: spawnOptions.stderr })
  spawnOptions.env = environment
  return BunHost.getRuntime().spawn<In, Out, Err>(resolveCommandArguments(command, variadicArgs), spawnOptions)
}

type TerminalColorOptions = { stderr?: unknown; addEnv?: EnvironmentOverrides }

function resolveSpawnEnvironment(options: TerminalColorOptions): ProcessEnvironment {
  const environment = Env.clone(options.addEnv).values()
  if (preserveTerminalColors(options, environment)) {
    return { ...environment, FORCE_COLOR: '1' }
  }
  return environment
}

function preserveTerminalColors(options: TerminalColorOptions, environment: ProcessEnvironment): boolean {
  const explicitPreference = environment.NO_COLOR !== undefined || environment.FORCE_COLOR !== undefined
  if (explicitPreference || options.stderr !== 'pipe') {
    return false
  }
  return Process.stderr.isTTY && Process.stderr.hasColors()
}
