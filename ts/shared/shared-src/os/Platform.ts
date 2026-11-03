import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
import * as BunHost from './bridges/Bridge_bun/Bridge_bun'

import * as Node from './bridges/Bridge_node/Bridge_node'

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

/** randomUUID creates a random identifier for owned artifacts. */
export function randomUUID(): string {
  return WebHost.crypto.randomUUID()
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
