import { FS, Path } from '@shared/os'

/** resolveResources locates the installed TSX parser, queries and license. */
export function resolveResources(modulesDirectory: string) {
  const directory = FS.realpathSync(Path.join(modulesDirectory, 'tree-sitter-typescript'))
  return {
    directory,
    grammar: Path.join(directory, 'tree-sitter-tsx.wasm'),
    query: Path.join(directory, 'queries/highlights.scm'),
    license: Path.join(directory, 'LICENSE'),
  }
}
