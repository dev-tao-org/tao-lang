import { FS, Path, Repo } from '@shared/os'
import { createWasmDocumentSession, type SessionOptions } from '../tao-ide-extension-src/core'

const packageRoot = Repo.resolvePath('.artifacts/ide-extension/package')

/** loadRuntime starts an editor session with the packaged language assets. */
export async function loadRuntime(measure?: SessionOptions['measure']) {
  const readBytes = (path: string) => FS.readFile(Path.join(packageRoot, path))
  const [taoGrammar, tsxGrammar, taoQuery, tsxQuery] = await Promise.all([
    readBytes('grammars/tree-sitter-tao.wasm'),
    readBytes('grammars/tree-sitter-tsx.wasm'),
    FS.readFile(Path.join(packageRoot, 'queries/tao-highlights.scm'), 'utf8'),
    FS.readFile(Path.join(packageRoot, 'queries/tsx-highlights.scm'), 'utf8'),
  ])
  return createWasmDocumentSession(
    { taoGrammar, tsxGrammar, taoQuery, tsxQuery },
    measure,
    Path.join(packageRoot, 'runtime/web-tree-sitter.wasm'),
  )
}
