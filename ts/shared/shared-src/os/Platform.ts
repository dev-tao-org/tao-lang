export { tmpdir } from 'node:os'
import { isBuiltin } from 'node:module'

/** isPlatformImport identifies runtime builtins that belong behind the OS boundary. */
export function isPlatformImport(specifier: string): boolean {
  return specifier === 'bun' || specifier.startsWith('bun:') || isBuiltin(specifier)
}

/** spawn starts a child process through the managed runtime. */
export const spawn = Bun.spawn

/** argv contains the current CLI invocation arguments. */
export const argv = Bun.argv

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
