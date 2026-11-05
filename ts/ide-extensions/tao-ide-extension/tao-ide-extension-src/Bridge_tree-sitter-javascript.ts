import { Path } from '@shared/os'

/** resolveResources locates the JavaScript queries required by the pinned TSX grammar. */
export function resolveResources(typescriptDirectory: string) {
  const directory = Path.join(Path.dirname(typescriptDirectory), 'tree-sitter-javascript')
  return {
    queries: [Path.join(directory, 'queries/highlights.scm'), Path.join(directory, 'queries/highlights-jsx.scm')],
    license: Path.join(directory, 'LICENSE'),
  }
}
