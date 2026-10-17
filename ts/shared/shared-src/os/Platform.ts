export { tmpdir } from 'node:os'
import { isBuiltin } from 'node:module'
import { arch, release, type } from 'node:os'
import { Errors } from '../universal/universal'

/** isPlatformImport identifies runtime builtins that belong behind the OS boundary. */
export function isPlatformImport(specifier: string): boolean {
  return specifier === 'bun' || specifier.startsWith('bun:') || isBuiltin(specifier)
}

/** spawn starts a child process, retaining terminal colors when diagnostic output is piped. */
export const spawn: typeof Bun.spawn = (...args: unknown[]) => {
  const optionIndex = Array.isArray(args[0]) ? 1 : 0
  const options = (args[optionIndex] ?? {}) as { stderr?: unknown; env?: Record<string, string | undefined> }
  if (preserveTerminalColors(options)) {
    args[optionIndex] = { ...options, env: { ...(options.env ?? process.env), FORCE_COLOR: '1' } }
  }
  return Reflect.apply(Bun.spawn, Bun, args)
}

function preserveTerminalColors(options: { stderr?: unknown; env?: Record<string, string | undefined> }): boolean {
  const environment = options.env ?? process.env
  const explicitPreference = environment.NO_COLOR !== undefined || environment.FORCE_COLOR !== undefined
  return !explicitPreference && options.stderr === 'pipe' && process.stderr.isTTY && process.stderr.hasColors()
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

/** readText consumes a child output stream without exposing the runtime reader. */
export function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

/** isMain reports whether the caller is the program entrypoint. */
export function isMain(meta: ImportMeta): boolean {
  return meta.main ?? false
}

/** systemInfo reads non-identifying operating-system and architecture information. */
export function systemInfo(): { architecture: string; kernel: string; os: string } {
  return { architecture: arch(), kernel: release(), os: type() }
}

/** capture reads command output and throws when the command fails. */
export async function capture(command: string, variadicArgs: readonly string[] = [], cwd?: string): Promise<string> {
  const args = [...command.split(' '), ...variadicArgs]
  const child = spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [status, stdout, stderr] = await Promise.all([child.exited, readText(child.stdout), readText(child.stderr)])
  if (status !== 0) {
    Errors.ThrowCommandExecution({
      command: args[0],
      args: args.slice(1),
      cwd,
      status,
      signal: child.signalCode,
      stdout,
      stderr,
    })
  }
  return stdout.trim()
}
