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
    '3-typecheck': packageWorkspace(['**/*.test.ts']),
    '4-fix': packageWorkspace(['**/*.test.ts']),
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
      'CLIs-src/dev-cli/commands/_setup.ts',
      'CLIs-src/dev-cli/commands/_setup-complete.ts',
      'CLIs-src/dev-cli/testing/TaoTestWorker.ts',
      ...await skillEntries(),
      '**/*.test.ts',
    ]),
    perf: packageWorkspace([
      'perf-src/parser-sample.ts',
      'perf-src/parser-performance.ts',
      'perf-src/preview-performance.ts',
      'perf-src/PreviewHarness.ts',
      'perf-src/preview-browser.ts',
      '**/*.test.ts',
    ]),
    shared: packageWorkspace(['**/*.test.ts']),
    stdlib: packageWorkspace(['**/*.test.ts', 'stdlib-src/.tao/.gitignore.d.ts']),
    'ide-extensions/tao-ide-extension': nestedPackageWorkspace(['tao-ide-extension-src/extension.ts', '**/*.test.ts']),
    'ide-extensions/dev-tao-org': nestedPackageWorkspace(['dev-tao-org-src/extension.ts', '**/*.test.ts']),
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
      '@shared/os/preview': ['../shared/shared-src/os/PreviewPlatform.ts'],
      '@grammar/*': ['../1-grammar/grammar-src/*'],
      '@ast-gen/*': ['../2-ast-gen/ast-gen-src/*'],
      '@typecheck/*': ['../3-typecheck/typecheck-src/*'],
      '@fix/*': ['../4-fix/fix-src/*'],
      '@check/*': ['../5-check/check-src/*'],
      '@compile/*': ['../6-compile/compile-src/*'],
      '@runtime/*': ['../7-runtime/runtime-src/*'],
      '@workspace/*': ['../0-workspace/workspace-src/*'],
      '@stdlib/*': ['../stdlib/stdlib-src/*'],
    },
  }
}

function nestedPackageWorkspace(entry: string[]) {
  const configuration = packageWorkspace(entry)
  return {
    ...configuration,
    paths: Object.fromEntries(
      Object.entries(configuration.paths).map(([name, paths]) => [name, paths.map(path => `../${path}`)]),
    ),
  }
}

function cliEntries(): string[] {
  return [
    'CLIs-src/agent-cli/agent-cli.ts',
    'CLIs-src/dev-cli/dev-cli.ts',
    'CLIs-src/tao-cli/tao-cli.ts',
  ]
}

function commandEntries(registry: string): string[] {
  const source = FileSystem.readFileSync(Repo.resolvePath('ts', 'CLIs', registry), 'utf8')
  return [...source.matchAll(/^import\s+['"](\.\/commands\/[^'"]+)['"]\s*;?\s*$/gm)]
    .map(([, specifier]) => Path.posix.join(Path.dirname(registry), specifier!) + '.ts')
}

async function skillEntries(): Promise<string[]> {
  const root = Repo.resolvePath('ts/CLIs/CLIs-src/agent-skills')
  const entries: string[] = []
  for (const folder of await FileSystem.readdir(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) {
      continue
    }
    const name = folder.name
    const path = Path.join(root, name, `${name}.ts`)
    if (FileSystem.existsSync(path) && FileSystem.statSync(path).isFile()) {
      entries.push(`CLIs-src/agent-skills/${name}/${name}.ts`)
    }
  }
  return entries.sort()
}
