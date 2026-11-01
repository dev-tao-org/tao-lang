import { Errors, Regxs, Try } from '../universal/universal'
import * as Node from './NodeBuiltins'

/** homeDirectory returns the current user's platform home directory. */
export function homeDirectory(): string {
  return Node.homedir()
}

/** temporaryDirectory returns the host's temporary-file directory. */
export function temporaryDirectory(): string {
  return Node.tmpdir()
}

/** runtimeVersion returns the active Bun runtime version. */
export function runtimeVersion(): string {
  return Bun.version
}

/** loadModule loads a known runtime module, including native Node-API addons. */
export function loadModule<Value>(path: string): Value {
  return Node.createRequire(import.meta.url)(path) as Value
}

/** hashText hashes exact build inputs and generated output for cache validation. */
export function hashText(source: string): string {
  return Node.createHash('sha256').update(source).digest('hex')
}

/** hashBytes hashes a byte sequence with the requested digest algorithm. */
export function hashBytes(bytes: Uint8Array, algorithm: string): string {
  return Node.createHash(algorithm).update(bytes).digest('base64')
}

/** isPlatformImport identifies runtime builtins that belong behind the OS boundary. */
export function isPlatformImport(specifier: string): boolean {
  return specifier === 'bun' || specifier.startsWith('bun:') || Node.isBuiltin(specifier)
}

type SpawnOptions<
  In extends Bun.SpawnOptions.Writable,
  Out extends Bun.SpawnOptions.Readable,
  Err extends Bun.SpawnOptions.Readable,
> = Bun.SpawnOptions.SpawnOptions<In, Out, Err> & { variadicArgs?: readonly string[] }
type SpawnCommand = string | readonly string[]
type SpawnOutputOption = 'stdout' | 'stderr' | 'stdio'

/** ChildProcessInput describes supported standard-input sources for owned subprocesses. */
export type ChildProcessInput = Bun.SpawnOptions.Writable

type NamedSpawnOptions<
  In extends Bun.SpawnOptions.Writable,
  Out extends Bun.SpawnOptions.Readable,
  Err extends Bun.SpawnOptions.Readable,
> = Omit<SpawnOptions<In, Out, Err>, SpawnOutputOption> & { stdout?: never; stderr?: never; stdio?: never }

/** spawnPiped starts a child process and captures both output streams. */
export function spawnPiped<const In extends Bun.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'pipe', 'pipe'> = {},
): PipedChildProcess<In> {
  return spawn(command, { ...options, stdout: 'pipe', stderr: 'pipe' })
}

/** spawnStderrPiped starts a child process and captures standard error. */
export function spawnStderrPiped<const In extends Bun.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'ignore', 'pipe'> = {},
): Bun.Subprocess<In, 'ignore', 'pipe'> {
  return spawn(command, { ...options, stdout: 'ignore', stderr: 'pipe' })
}

/** spawnInherited starts a child process with output streams inherited. */
export function spawnInherited<const In extends Bun.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'inherit', 'inherit'> = {},
): Bun.Subprocess<In, 'inherit', 'inherit'> {
  return spawn(command, { ...options, stdout: 'inherit', stderr: 'inherit' })
}

/** spawnStderrInherited starts a child process with standard error inherited. */
export function spawnStderrInherited<const In extends Bun.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'ignore', 'inherit'> = {},
): Bun.Subprocess<In, 'ignore', 'inherit'> {
  return spawn(command, { ...options, stdout: 'ignore', stderr: 'inherit' })
}

/** spawnStdoutInherited starts a child process with standard output inherited. */
export function spawnStdoutInherited<const In extends Bun.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'inherit', 'ignore'> = {},
): Bun.Subprocess<In, 'inherit', 'ignore'> {
  return spawn(command, { ...options, stdout: 'inherit', stderr: 'ignore' })
}

/** spawnSilent starts a child process with output streams ignored. */
export function spawnSilent<const In extends Bun.SpawnOptions.Writable = 'ignore'>(
  command: SpawnCommand,
  options: NamedSpawnOptions<In, 'ignore', 'ignore'> = {},
): Bun.Subprocess<In, 'ignore', 'ignore'> {
  return spawn(command, { ...options, stdout: 'ignore', stderr: 'ignore' })
}

/** argv contains the current CLI invocation arguments. */
export const argv = process.argv

/** pid identifies the current process. */
export const pid = process.pid

/** ChildProcess identifies an owned process handled by command supervision. */
export type ChildProcess = Bun.Subprocess

/** PipedChildProcess owns captured output streams for one subprocess. */
export type PipedChildProcess<In extends ChildProcessInput = 'ignore'> = Bun.Subprocess<In, 'pipe', 'pipe'>

/** terminate stops an owned child and waits for its process to exit. */
export async function terminate(child: Bun.Subprocess): Promise<void> {
  child.kill('SIGKILL')
  await child.exited
}

/** onUncaughtException installs a process-wide exception listener. */
export function onUncaughtException(handler: (error: unknown) => void): void {
  process.on('uncaughtException', handler)
}

/** onUnhandledRejection installs a process-wide rejected-promise listener. */
export function onUnhandledRejection(handler: (error: unknown) => void): void {
  process.on('unhandledRejection', handler)
}

/** exit terminates the current process with the supplied status. */
export function exit(status: number): never {
  process.exit(status)
}

/** randomUUID creates a random identifier for owned artifacts. */
export function randomUUID(): string {
  return crypto.randomUUID()
}

/** readText consumes a child output stream without exposing the runtime reader. */
export function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

/** isMain reports whether the caller is the program entrypoint. */
export function isMain(meta: ImportMeta): boolean {
  return meta.main ?? false
}

/** SystemInformation identifies the host platform without exposing user-specific details. */
export type SystemInformation = { architecture: string; kernel: string; os: string }
/** systemInfo reads non-identifying operating-system and architecture information. */
export function systemInfo(): SystemInformation {
  const architecture = Node.arch()
  const kernel = Node.release()
  const os = Node.osType()
  return { architecture, kernel, os }
}

/** HostSystem identifies operating-system names with supported desktop host behavior. */
export type HostSystem = 'Darwin' | 'Windows_NT' | 'Linux'

/** isSupportedHostSystem narrows an operating-system name before host-specific dispatch. */
export function isSupportedHostSystem(system: string): system is HostSystem {
  return system === 'Darwin' || system === 'Windows_NT' || system === 'Linux'
}

type CaptureOptions = { variadicArgs?: readonly string[]; cwd?: string; trim?: boolean }
/** capture reads command output and throws when the command fails; trim:false preserves exact text. */
export async function capture(
  command: string,
  options: CaptureOptions = {},
): Promise<string> {
  const args = [...command.trim().split(Regxs.SpacesRegx), ...options.variadicArgs ?? []]
  const child = spawnPiped(command, { variadicArgs: options.variadicArgs, cwd: options.cwd })
  const [status, stdout, stderr] = await Promise.all([child.exited, readText(child.stdout), readText(child.stderr)])
  if (status !== 0) {
    Errors.ThrowCommandExecution({
      command: args[0],
      args: args.slice(1),
      cwd: options.cwd,
      status,
      signal: child.signalCode,
      stdout,
      stderr,
    })
  }
  return options.trim === false ? stdout : stdout.trim()
}

/** requireHostProcessAccess rejects restricted execution before starting host-dependent tools.
 *  Process inspection is a conservative prerequisite, not proof of every desktop permission. */
export async function requireHostProcessAccess(
  hint: string,
  inspect = () => capture('ps -axo pid=,ppid='),
): Promise<void> {
  const processes = await Try(inspect, {
    catch(error) {
      Errors.ThrowHostEnvironment(`Host process access is unavailable. ${hint}`, { cause: error })
    },
  })
  if (!processes) {
    Errors.ThrowHostEnvironment(`Host process inspection returned no processes. ${hint}`)
  }
}

/** captureSync reads a synchronous tool probe without requiring the Bun runtime. */
export function captureSync(command: string, options: { variadicArgs?: readonly string[]; cwd?: string } = {}): string {
  const [executable, ...args] = command.trim().split(Regxs.SpacesRegx)
  return Node.execFileSync(executable, [...args, ...options.variadicArgs ?? []], {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function spawn<
  const In extends Bun.SpawnOptions.Writable = 'ignore',
  const Out extends Bun.SpawnOptions.Readable = 'pipe',
  const Err extends Bun.SpawnOptions.Readable = 'inherit',
>(command: SpawnCommand, options: SpawnOptions<In, Out, Err> = {}): Bun.Subprocess<In, Out, Err> {
  const { variadicArgs = [], ...spawnOptions } = options
  const environment = spawnEnvironment(spawnOptions)
  if (environment) {
    spawnOptions.env = environment
  }
  const args = typeof command === 'string' ? command.trim().split(Regxs.SpacesRegx) : [...command]
  return Bun.spawn<In, Out, Err>([...args, ...variadicArgs], spawnOptions)
}

function spawnEnvironment(options: TerminalColorOptions): Record<string, EnvironmentValue> | undefined {
  return preserveTerminalColors(options)
    ? { ...(options.env ?? process.env), FORCE_COLOR: '1' }
    : undefined
}

type EnvironmentValue = string | undefined
type TerminalColorOptions = { stderr?: unknown; env?: Record<string, EnvironmentValue> }

function preserveTerminalColors(options: TerminalColorOptions): boolean {
  const environment = options.env ?? process.env
  const explicitPreference = environment.NO_COLOR !== undefined || environment.FORCE_COLOR !== undefined
  if (explicitPreference || options.stderr !== 'pipe') {
    return false
  }
  return process.stderr.isTTY && process.stderr.hasColors()
}
