import { AsyncLocalStorage } from './bridges/Bridge_node/Bridge_node'
import * as Process from './Process'

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

/** currentDirectory returns the dedicated Metro process working directory. */
export function currentDirectory(): string {
  return Process.cwd()
}

/** synchronizeBuiltinExports updates captured ESM filesystem exports after installing a router. */
export { syncBuiltinESMExports as synchronizeBuiltinExports } from './bridges/Bridge_node/Bridge_node'

export { default as Env } from './Env'
export * as FS from './FS'
export * as GeneratedFileSystem from './FS/GeneratedFileSystem'
export * as NodeHttp from './net/NodeHttp'
export * as WebSocketPayload from './net/WebSocketPayload'
export * as Path from './Path'
