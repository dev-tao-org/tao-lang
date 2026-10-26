import * as nativePath from 'node:path'
import * as nodeStream from 'node:stream'

export { nativePath, nodeStream }
/** JavaScriptCore represents the Bun JavaScriptCore module type. */
export type JavaScriptCore = typeof import('bun:jsc')
/** BunTestModule represents the Bun test API type. */
export type BunTestModule = typeof import('bun:test')
export { rejects, throws } from 'node:assert/strict'
export { AsyncLocalStorage } from 'node:async_hooks'
export { Buffer } from 'node:buffer'
export { execFileSync, spawn } from 'node:child_process'
export { createHash, randomUUID } from 'node:crypto'
export {
  appendFileSync,
  constants,
  default as nativeFileSystem,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  type Stats,
  statSync,
  writeFileSync,
} from 'node:fs'
export { rename as move } from 'node:fs/promises'
export {
  access,
  chmod,
  copyFile,
  cp,
  default as nativeFileSystemPromises,
  lstat,
  mkdir,
  mkdtemp,
  open,
  opendir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
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
