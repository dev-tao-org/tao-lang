import * as nativePath from 'node:path'
import * as nodeStream from 'node:stream'

export { nativePath, nodeStream }
/** ModuleLoader describes a Node-compatible require function. */
export type ModuleLoader = NodeJS.Require
export { rejects, throws } from 'node:assert/strict'
export { AsyncLocalStorage } from 'node:async_hooks'
export { Buffer } from 'node:buffer'
export { spawn, spawnSync } from 'node:child_process'
export { createHash, randomUUID } from 'node:crypto'

export { IncomingMessage as IncomingRequest, ServerResponse as OutgoingResponse } from 'node:http'
export { createRequire, isBuiltin, syncBuiltinESMExports } from 'node:module'
export { arch, homedir, release, tmpdir, type as osType } from 'node:os'
export {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path'
export { emitKeypressEvents } from 'node:readline'
export { createInterface, type ReadLineOptions } from 'node:readline/promises'
export { Readable } from 'node:stream'
export { StringDecoder } from 'node:string_decoder'
export { fileURLToPath, pathToFileURL } from 'node:url'
export { format, inspect as inspectValue, stripVTControlCharacters } from 'node:util'

export * from './Bridge_node-fs/Bridge_node-fs'
