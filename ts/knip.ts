import type { KnipConfig } from 'knip'
import * as TypeScript from 'typescript'
import { FileSystem, Path } from './shared/shared-src/os'

const cliEntries = [
  'CLIs/CLIs-src/agent-cli/agent-cli.ts',
  'CLIs/CLIs-src/dev-cli/dev-cli.ts',
]

/** knipConfiguration checks new sources while recognizing only imported command registrations. */
const knipConfiguration: KnipConfig = {
  entry: [
    ...cliEntries,
    ...cliEntries.flatMap(commandEntries),
    'CLIs/CLIs-src/tao-cli/tao-cli.ts',
    '**/*.test.ts',
  ],
  project: ['CLIs/**/*.ts', 'shared/**/*.ts'],
  include: ['enumMembers', 'exports', 'files', 'nsExports', 'nsTypes', 'types'],
}

function commandEntries(registry: string): string[] {
  const source = FileSystem.readFileSync(Path.resolve(import.meta.dirname, registry), 'utf8')
  const file = TypeScript.createSourceFile(registry, source, TypeScript.ScriptTarget.Latest)
  return file.statements.flatMap(statement => {
    if (!TypeScript.isImportDeclaration(statement) || statement.importClause) {
      return []
    }
    const specifier = statement.moduleSpecifier
    if (!TypeScript.isStringLiteral(specifier) || !specifier.text.startsWith('./commands/')) {
      return []
    }
    return [Path.posix.join(Path.dirname(registry), specifier.text) + '.ts']
  })
}

export default knipConfiguration
