export { Edit, Language, type Node, Parser, Query, type Tree } from 'web-tree-sitter'

/** resolveWasmResource resolves the WASM runtime shipped with the installed parser package. */
export function resolveWasmResource(modulesDirectory: string): string {
  return modulesDirectory + '/web-tree-sitter/web-tree-sitter.wasm'
}

/** resolveLicenseResource resolves the installed parser package's license. */
export function resolveLicenseResource(modulesDirectory: string): string {
  return modulesDirectory + '/web-tree-sitter/LICENSE'
}
