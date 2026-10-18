import { FileSystem, Path, Repo } from '../shared/shared-src/os'

/** knipConfiguration checks package workspaces while recognizing imported command registrations. */
export default {
  workspaces: {
    '0-workspace': packageWorkspace([
      'workspace-src/Workspace.ts',
      '**/*.test.ts',
    ]),
    '1-grammar': packageWorkspace(['**/*.test.ts']),
    '2-ast-gen': packageWorkspace(['**/*.test.ts']),
    '3-typecheck': packageWorkspace([]),
    '4-fix': packageWorkspace([]),
    '5-check': packageWorkspace([]),
    '6-compile': packageWorkspace(['**/*.test.ts']),
    '7-runtime': packageWorkspace([
      'runtime-src/TR.ts',
      'runtime-src/HMRClient.ts',
      '**/*.test.ts',
    ]),
    CLIs: packageWorkspace([
      ...cliEntries(),
      ...cliEntries().flatMap(commandEntries),
      'CLIs-src/tao-cli/tao-cli.ts',
      'CLIs-src/dev-cli/commands/_setup.ts',
      '**/*.test.ts',
    ]),
    perf: packageWorkspace([
      'perf-src/parser-sample.ts',
      'perf-src/parser-performance.ts',
      'perf-src/preview-performance.ts',
      'perf-src/PreviewHarness.ts',
      'perf-src/preview-browser.ts',
    ]),
    shared: packageWorkspace(['**/*.test.ts']),
  },
  include: ['enumMembers', 'exports', 'files', 'nsExports', 'nsTypes', 'types'],
}

function packageWorkspace(entry: string[]) {
  return {
    ...(entry.length > 0 ? { entry } : {}),
    project: ['**/*.{ts,tsx}'],
    paths: {
      '@cli-kit': ['../CLIs/CLIs-src/cli-kit/cli-kit.ts'],
      '@shared': ['../shared/shared-src/shared.ts'],
      '@shared/os': ['../shared/shared-src/os.ts'],
      '@grammar/*': ['../1-grammar/grammar-src/*'],
      '@ast-gen/*': ['../2-ast-gen/ast-gen-src/*'],
      '@typecheck/*': ['../3-typecheck/typecheck-src/*'],
      '@fix/*': ['../4-fix/fix-src/*'],
      '@check/*': ['../5-check/check-src/*'],
      '@compile/*': ['../6-compile/compile-src/*'],
      '@runtime/*': ['../7-runtime/runtime-src/*'],
      '@workspace/*': ['../0-workspace/workspace-src/*'],
    },
  }
}

function cliEntries(): string[] {
  return [
    'CLIs-src/agent-cli/agent-cli.ts',
    'CLIs-src/dev-cli/dev-cli.ts',
  ]
}

function commandEntries(registry: string): string[] {
  const source = FileSystem.readFileSync(Repo.resolvePath('ts', 'CLIs', registry), 'utf8')
  return [...source.matchAll(/^import\s+['"](\.\/commands\/[^'"]+)['"]\s*;?\s*$/gm)]
    .map(([, specifier]) => Path.posix.join(Path.dirname(registry), specifier!) + '.ts')
}
