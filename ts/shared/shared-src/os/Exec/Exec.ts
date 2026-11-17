import * as ExternalErrors from '../../universal/Errors/external'
import { Errors, Regxs, Try } from '../../universal/universal'
import * as UserInput from '../../universal/UserInput'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import * as BunHost from '../bridges/Bridge_bun/Bridge_bun'
import * as Node from '../bridges/Bridge_node/Bridge_node'
import Env from '../Env'
import * as Process from '../Process'
import { collectCommand } from './Exec-Capture'

/** Command specifies the exact executable name or path. */
export type Command = string
/** CommandArgs accepts exact argv entries or whitespace-separated fixed tokens. */
export type CommandArgs = string | readonly string[]
/** ChildProcessInput describes supported standard-input sources for owned subprocesses. */
export type ChildProcessInput = BunHost.SpawnOptions.Writable
/** ChildProcess identifies an owned process handled by command supervision. */
export type ChildProcess = BunHost.Subprocess
/** PipedChildProcess owns captured output streams for one subprocess. */
export type PipedChildProcess<In extends ChildProcessInput = 'ignore'> = BunHost.Subprocess<In, 'pipe', 'pipe'>

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
/** CommandOptions configures the working directory and environment overrides. */
export type CommandOptions = {
  cwd?: string
  addEnv?: EnvironmentOverrides
}
type CapturedCommandOptions = CommandOptions & {
  stdin?: ProcessInput
  timeoutMs?: number
}
/** CaptureOptions configures captured execution and allows returning nonzero or signalled outcomes with check:false. */
export type CaptureOptions = CapturedCommandOptions & { check?: boolean }
/** CaptureStdoutOptions configures captured execution and allows preserving exact output with trim:false. */
export type CaptureStdoutOptions = CapturedCommandOptions & { trim?: boolean }

type CommandParameters<Options extends CommandOptions> = [options?: Options] | [args: CommandArgs, options?: Options]

type OutputMode = 'pipe' | 'inherit' | 'ignore'
type TerminalOption = BunHost.SpawnOptions.SpawnOptions<'ignore', 'pipe', 'pipe'>['terminal']
/** SpawnOptions configures an owned child's stream routing and optional terminal. */
export type SpawnOptions<
  In extends ChildProcessInput = 'ignore',
  Out extends OutputMode = 'pipe',
  Err extends OutputMode = 'pipe',
> = CommandOptions & { stdin?: In; stdout?: Out; stderr?: Err; terminal?: TerminalOption }

/** spawn starts an owned child and immediately returns its handle. Output is piped by default. */
export function spawn<
  const In extends ChildProcessInput = 'ignore',
  const Out extends OutputMode = 'pipe',
  const Err extends OutputMode = 'pipe',
>(command: Command, ...parameters: CommandParameters<SpawnOptions<In, Out, Err>>): BunHost.Subprocess<In, Out, Err> {
  const { invocation, options = {} } = resolveCommand(command, parameters)
  return startCommand(invocation, options)
}

/** capture waits for a command and captures both streams. Launch and I/O failures always throw. */
export async function capture(
  command: Command,
  ...parameters: CommandParameters<CaptureOptions>
): Promise<CommandResult<number>> {
  const { invocation, options = {} } = resolveCommand(command, parameters)
  return requireCommandSuccess(await runCaptured(invocation, options), options.check)
}

/** captureStdout waits for a successful command and returns its stdout, trimmed by default. */
export async function captureStdout(
  command: Command,
  ...parameters: CommandParameters<CaptureStdoutOptions>
): Promise<string> {
  const { invocation, options = {} } = resolveCommand(command, parameters)
  const result = requireCommandSuccess(await runCaptured(invocation, options))
  return options.trim === false ? result.stdout : result.stdout.trim()
}

/** runSync captures a command's outcome synchronously without requiring Bun. */
export function runSync(command: Command, ...parameters: CommandParameters<CaptureOptions>): CommandResult {
  const { invocation, options = {} } = resolveCommand(command, parameters)
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
  return requireCommandSuccess(result, options.check)
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

/** resolveCommandArgs returns exact argv entries from a separate command argument value. */
export function resolveCommandArgs(args: CommandArgs): string[] {
  if (typeof args !== 'string') {
    return [...args]
  }
  const text = args.trim()
  return text ? text.split(Regxs.WhitespaceRunsRegx) : []
}

type CommandInvocationField = 'command' | 'args' | 'cwd'
/** CommandInvocation identifies the executable, arguments and working directory before execution. */
export type CommandInvocation = Pick<CommandResult, CommandInvocationField>
type CommandInputMode = 'pipe' | 'ignore'
function requireCommandSuccess<Status extends CommandStatus>(
  result: CommandResult<Status>,
  check = true,
): CommandResult<Status> {
  const failed = result.status !== 0 || result.signal !== null
  if (check && failed) {
    Errors.ThrowCommandExecution(result)
  }
  return result
}

function runCaptured(invocation: CommandInvocation, options: CapturedCommandOptions): Promise<CommandResult<number>> {
  const spawnOptions = createCommandSpawnOptions(options)
  const child = startCommand(invocation, spawnOptions)
  return collectCommand(child, invocation, options)
}

function throwCommandFailure(
  invocation: CommandInvocation,
  error: unknown,
  result: CommandResult = createCommandResult(invocation, null, null, '', ''),
): never {
  const cause = Errors.isNativeError(error) ? error : ExternalErrors.fromUnknown(error)
  Errors.ThrowCommandExecution({ ...result, error: cause })
}

function resolveCommand<Options extends CommandOptions>(
  command: Command,
  [argsOrOptions, explicitOptions]: CommandParameters<Options>,
) {
  UserInput.require(!(typeof command !== 'string' || !command.trim()), 'A command is required.')
  const hasArgs = isCommandArgs(argsOrOptions)
  const args = hasArgs ? resolveCommandArgs(argsOrOptions) : []
  const options = hasArgs ? explicitOptions : argsOrOptions
  const invocation: CommandInvocation = { command, args, cwd: options?.cwd }
  return { invocation, options }
}

function isCommandArgs(value: unknown): value is CommandArgs {
  return typeof value === 'string' || Array.isArray(value)
}

function createCommandSpawnOptions(options: CapturedCommandOptions) {
  const stdin: CommandInputMode = options.stdin === undefined ? 'ignore' : 'pipe'
  return { cwd: options.cwd, addEnv: options.addEnv, stdin }
}

function createCommandSyncOptions(options: CaptureOptions) {
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

function startCommand<
  In extends ChildProcessInput = 'ignore',
  Out extends OutputMode = 'pipe',
  Err extends OutputMode = 'pipe',
>(invocation: CommandInvocation, options: SpawnOptions<In, Out, Err>): BunHost.Subprocess<In, Out, Err> {
  const { stdin, stdout, stderr, terminal, addEnv } = options
  const spawnOptions = {
    cwd: invocation.cwd,
    env: resolveSpawnEnvironment({ addEnv, stderr: stderr ?? 'pipe' }),
    stdin: stdin ?? 'ignore' as In,
    stdout: stdout ?? 'pipe' as Out,
    stderr: stderr ?? 'pipe' as Err,
    terminal,
  }
  const argv = [invocation.command, ...invocation.args]
  return Try(() => BunHost.getRuntime().spawn<In, Out, Err>(argv, spawnOptions), {
    catch: error => throwCommandFailure(invocation, error),
  })
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
