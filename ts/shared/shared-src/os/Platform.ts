import { Errors, Try } from '../universal/universal'
import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
import * as BunHost from './bridges/Bridge_bun/Bridge_bun'
import { hostProcess } from './bridges/Bridge_node/Bridge_node'
import * as Node from './bridges/Bridge_node/Bridge_node'

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
  return BunHost.getRuntime().version
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

/** spawn starts a child process, retaining terminal colors when diagnostic output is piped. */
export function spawn<
  const In extends BunHost.SpawnOptions.Writable = 'ignore',
  const Out extends BunHost.SpawnOptions.Readable = 'pipe',
  const Err extends BunHost.SpawnOptions.Readable = 'inherit',
>(command: string | readonly string[], options: SpawnOptions<In, Out, Err> = {}): BunHost.Subprocess<In, Out, Err> {
  const { variadicArgs = [], ...spawnOptions } = options
  if (preserveTerminalColors(spawnOptions)) {
    spawnOptions.env = { ...(spawnOptions.env ?? hostProcess.env), FORCE_COLOR: '1' }
  }
  const args = typeof command === 'string' ? command.trim().split(/ +/) : [...command]
  return BunHost.getRuntime().spawn<In, Out, Err>([...args, ...variadicArgs], spawnOptions)
}

/** argv contains the current CLI invocation arguments. */
export const argv = hostProcess.argv

/** pid identifies the current process. */
export const pid = hostProcess.pid

/** ChildProcess identifies an owned process handled by command supervision. */
export type ChildProcess = BunHost.Subprocess

/** terminate stops an owned child and waits for its process to exit. */
export async function terminate(child: BunHost.Subprocess): Promise<void> {
  child.kill('SIGKILL')
  await child.exited
}

/** onUncaughtException installs a process-wide exception listener. */
export function onUncaughtException(handler: (error: unknown) => void): void {
  hostProcess.on('uncaughtException', handler)
}

/** onUnhandledRejection installs a process-wide rejected-promise listener. */
export function onUnhandledRejection(handler: (error: unknown) => void): void {
  hostProcess.on('unhandledRejection', handler)
}

/** exit terminates the current process with the supplied status. */
export function exit(status: number): never {
  return hostProcess.exit(status)
}

/** randomUUID creates a random identifier for owned artifacts. */
export function randomUUID(): string {
  return WebHost.crypto.randomUUID()
}

/** readText consumes a child output stream without exposing the runtime reader. */
export function readText(stream: WebHost.ReadableStream<Uint8Array>): Promise<string> {
  return new WebHost.Response(stream).text()
}

/** isMain reports whether the caller is the program entrypoint. */
export function isMain(meta: ImportMeta): boolean {
  return meta.main ?? false
}

/** systemInfo reads non-identifying operating-system and architecture information. */
export function systemInfo(): SystemInformation {
  return { architecture: Node.arch(), kernel: Node.release(), os: Node.osType() }
}

/** capture reads command output and throws when the command fails; trim:false preserves exact text. */
export async function capture(
  command: string,
  options: CaptureOptions = {},
): Promise<string> {
  const args = [...command.trim().split(/ +/), ...options.variadicArgs ?? []]
  const child = spawn(command, { variadicArgs: options.variadicArgs, cwd: options.cwd, stdout: 'pipe', stderr: 'pipe' })
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
  const [executable, ...args] = command.trim().split(/ +/)
  return Node.execFileSync(executable, [...args, ...options.variadicArgs ?? []], {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

type SpawnOptions<
  In extends BunHost.SpawnOptions.Writable,
  Out extends BunHost.SpawnOptions.Readable,
  Err extends BunHost.SpawnOptions.Readable,
> = BunHost.SpawnOptions.SpawnOptions<In, Out, Err> & { variadicArgs?: readonly string[] }

type SystemInformation = { architecture: string; kernel: string; os: string }

type CaptureOptions = { variadicArgs?: readonly string[]; cwd?: string; trim?: boolean }

function preserveTerminalColors(options: { stderr?: unknown; env?: Record<string, string | undefined> }): boolean {
  const environment = options.env ?? hostProcess.env
  const explicitPreference = environment.NO_COLOR !== undefined || environment.FORCE_COLOR !== undefined
  return !explicitPreference && options.stderr === 'pipe' && hostProcess.stderr.isTTY && hostProcess.stderr.hasColors()
}
