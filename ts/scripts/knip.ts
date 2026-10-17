import type { KnipConfig } from 'knip'
import * as TypeScript from 'typescript'
import { FileSystem, Path, Repo } from '../shared/shared-src/os'

/** knipConfiguration checks new sources while recognizing only imported command registrations. */
export default {
  entry: [
    ...cliEntries(),
    ...cliEntries().flatMap(commandEntries),
    'CLIs/CLIs-src/tao-cli/tao-cli.ts',
    'CLIs/CLIs-src/dev-cli/commands/_setup.ts',
    'perf/perf-src/parser-sample.ts',
    '**/*.test.ts',
  ],
  project: [
    'CLIs/**/*.ts',
    'shared/**/*.ts',
    '1-grammar/**/*.ts',
    '2-transform/**/*.ts',
    'perf/**/*.ts',
  ],
  include: ['enumMembers', 'exports', 'files', 'nsExports', 'nsTypes', 'types'],
} satisfies KnipConfig

function cliEntries(): string[] {
  return [
    'CLIs/CLIs-src/agent-cli/agent-cli.ts',
    'CLIs/CLIs-src/dev-cli/dev-cli.ts',
  ]
}

function commandEntries(registry: string): string[] {
  const source = FileSystem.readFileSync(Repo.resolvePath('ts', registry), 'utf8')
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
