import { Errors, Try } from '../universal/universal'
import * as Node from './NodeBuiltins'
import * as Processes from './Processes'

export {
  type AsyncCommandResult,
  type ChildProcess,
  type ChildProcessInput,
  type CommandResult,
  type CompletedCommandResult,
  type PipedChildProcess,
  readText,
  run,
  runIgnoreStatus,
  runIgnoreStatusSync,
  type RunOptions,
  runSync,
  spawnInherited,
  spawnPiped,
  spawnSilent,
  spawnStderrInherited,
  spawnStderrPiped,
  spawnStdoutInherited,
  terminate,
} from './Processes'

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

/** argv contains the current CLI invocation arguments. */
export const argv = process.argv

/** pid identifies the current process. */
export const pid = process.pid

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

type CaptureOptions = Processes.RunOptions & { trim?: boolean }

/** capture reads command output and throws when the command fails; trim:false preserves exact text. */
export async function capture(
  command: string,
  options: CaptureOptions = {},
): Promise<string> {
  const result = await Processes.run(command, options)
  return options.trim === false ? result.stdout : result.stdout.trim()
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
  return Processes.runSync(command, options).stdout
}
