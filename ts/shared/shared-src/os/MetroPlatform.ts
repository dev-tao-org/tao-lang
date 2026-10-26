import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Errors } from '../universal/universal'

/** createOperationContext retains one admitted Metro operation through asynchronous work. */
export function createOperationContext<Value>(): OperationContext<Value> {
  const storage = new AsyncLocalStorage<Value>()
  return { current: () => storage.getStore(), run: (value, operation) => storage.run(value, operation) }
}

/** OperationContext associates nested Metro calls with their admitted revision. */
export type OperationContext<Value> = {
  current(): Value | undefined
  run<Result>(value: Value, operation: () => Result): Result
}

/** loadExpoModule loads a module from the exact Expo CLI dependency graph serving this application. */
export function loadExpoModule(name: string, directory: string): unknown {
  return expoLoader(directory)(name)
}

/** loadMetroModule loads the actual underlying Metro dependency selected by Expo's wrapper. */
export function loadMetroModule(name: string, directory: string): unknown {
  const loader = expoLoader(directory)
  return createRequire(loader.resolve('@expo/metro/package.json'))(name)
}

/** assertMetroNotLoaded rejects filesystem readers captured before the authoritative preload. */
export function assertMetroNotLoaded(directory: string): void {
  const loader = expoLoader(directory)
  const metro = createRequire(loader.resolve('@expo/metro/package.json'))
  const paths = [
    metro.resolve('metro/private/Server'),
    metro.resolve('metro/private/HmrServer'),
    loader.resolve('@expo/metro-file-map'),
  ]
  if (paths.some(path => loader.cache[path] !== undefined)) {
    Errors.ThrowHostEnvironment(
      'Metro was imported before its generated filesystem preload. Restart with Tao preloaded first.',
    )
  }
}

/** readExpoSource reads a guarded dependency source relative to the installed Expo CLI package. */
export function readExpoSource(path: string, directory: string): string {
  const loader = expoLoader(directory)
  const root = dirname(loader.resolve('@expo/cli/package.json'))
  return readFileSync(join(root, path), 'utf8')
}

/** currentDirectory returns the dedicated Metro process working directory. */
export function currentDirectory(): string {
  return process.cwd()
}

/** messageByteLength measures the immutable serialized websocket payload before queue admission. */
export function messageByteLength(message: unknown): number {
  return typeof message === 'string' ? Buffer.byteLength(message) : Buffer.isBuffer(message) ? message.byteLength : 0
}

/** openWebSocket opens the runtime websocket used by the real Metro protocol acceptance fixture. */
export function openWebSocket(url: string): WebSocket {
  return new WebSocket(url)
}

/** synchronizeBuiltinExports updates captured ESM filesystem exports after installing a router. */
export { syncBuiltinESMExports as synchronizeBuiltinExports } from 'node:module'

/** IncomingRequest describes the publication endpoint's bounded request stream. */
export type IncomingRequest = import('node:http').IncomingMessage

/** OutgoingResponse describes Metro's existing HTTP response. */
export type OutgoingResponse = import('node:http').ServerResponse

/** readRequestText rejects an oversized publication before allocating its full body. */
export async function readRequestText(request: IncomingRequest, limit: number): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > limit) {
      request.destroy()
      Errors.ThrowUserInput('Generated publication exceeds its supported size.')
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function expoLoader(directory: string): NodeJS.Require {
  const application = createRequire(join(directory, 'package.json'))
  const expo = createRequire(application.resolve('expo/package.json'))
  return createRequire(expo.resolve('@expo/cli/package.json'))
}
