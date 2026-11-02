import { FileSystem, Path, Repo } from '../shared/shared-src/os'
import { Regxs } from '../shared/shared-src/shared'

/** knipConfiguration checks package workspaces while recognizing imported command registrations. */
export default {
  workspaces: {
    '0-workspace': createPackageWorkspace([
      'workspace-src/Workspace.ts',
    ]),
    '1-grammar': createPackageWorkspace([]),
    '2-ast-gen': createPackageWorkspace([]),
    '3-typecheck': createPackageWorkspace([]),
    '4-fix': createPackageWorkspace([]),
    '5-check': { ...createPackageWorkspace([]), entry: [] },
    '6-compile': createPackageWorkspace([]),
    '7-runtime': createPackageWorkspace([
      'runtime-src/client/TR.ts',
      'runtime-src/client/TaoRuntimeAPI.ts',
      'runtime-src/client/HMRClient.ts',
      'runtime-src/expo/MetroPreload.ts',
    ]),
    CLIs: createPackageWorkspace([
      ...listCLIEntries(),
      ...listCLIEntries().flatMap(listCommandEntries),
      'CLIs-src/dev-cli/commands/_setup.ts',
      'CLIs-src/dev-cli/commands/_setup-complete.ts',
      'CLIs-src/cli-checks/prepare-cli-generated.ts',
      'CLIs-src/dev-cli/testing/TaoTestWorker.ts',
      ...await listSkillEntries(),
    ]),
    perf: createPackageWorkspace([
      'perf-src/parser-sample.ts',
      'perf-src/parser-performance.ts',
      'perf-src/preview-performance.ts',
      'perf-src/PreviewHarness.ts',
      'perf-src/preview-browser.ts',
    ]),
    shared: createPackageWorkspace([]),
    stdlib: createPackageWorkspace(['stdlib-src/.tao/.gitignore.d.ts']),
    'ts-api': createPackageWorkspace(['ts-api-src/ts-api.ts']),
    'ide-extensions/tao-ide-extension': createNestedPackageWorkspace(['tao-ide-extension-src/extension.ts']),
    'ide-extensions/dev-tao-org': createNestedPackageWorkspace(['dev-tao-org-src/extension.ts']),
  },
  include: ['enumMembers', 'exports', 'files', 'nsExports', 'nsTypes', 'types'],
}

function createPackageWorkspace(entry: string[]) {
  return {
    entry: [...entry.map(pattern => `${pattern}!`), '**/*.test.ts'],
    project: ['**/*.{ts,tsx}!', '!**/*-test/**!', '!**/*.test.ts!'],
    paths: {
      '@cli-kit': ['../CLIs/CLIs-src/cli-kit/cli-kit.ts'],
      '@cst': ['../1-grammar/grammar-src/CST.ts'],
      '@shared': ['../shared/shared-src/shared.ts'],
      '@shared/os': ['../shared/shared-src/os.ts'],
      '@shared/os/preview': ['../shared/shared-src/os/preview/PreviewPlatform.ts'],
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

function createNestedPackageWorkspace(entry: string[]) {
  const configuration = createPackageWorkspace(entry)
  return {
    ...configuration,
    paths: Object.fromEntries(
      Object.entries(configuration.paths).map(([name, paths]) => [name, paths.map(path => `../${path}`)]),
    ),
  }
}

function listCLIEntries(): string[] {
  return [
    'CLIs-src/agent-cli/agent-cli.ts',
    'CLIs-src/dev-cli/dev-cli.ts',
    'CLIs-src/tao-cli/tao-cli.ts',
  ]
}

function listCommandEntries(registry: string): string[] {
  const source = FileSystem.readFileSync(Repo.resolvePath('ts', 'CLIs', registry), 'utf8')
  return [...source.matchAll(Regxs.CommandRegistrationImportRegx)]
    .map(([, specifier]) => Path.posix.join(Path.dirname(registry), specifier!) + '.ts')
}

async function listSkillEntries(): Promise<string[]> {
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
