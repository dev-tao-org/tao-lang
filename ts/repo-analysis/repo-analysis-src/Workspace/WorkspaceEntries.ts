import { Regxs, Sort } from '@shared'
import { FS, Path } from '@shared/os'

/** WorkspaceEntries maps workspace-relative package directories to runnable or externally loaded entry files. */
export type WorkspaceEntries = Record<string, readonly string[]>

/** ExternalWorkspaceEntries identifies exported contracts loaded by generated code or host tools. */
export const ExternalWorkspaceEntries: WorkspaceEntries = {
  '7-runtime': [
    'runtime-src/client/TR.ts',
    'runtime-src/client/Bridge_react/jsx-runtime.ts',
    'runtime-src/client/Bridge_react/jsx-dev-runtime.ts',
    'runtime-src/bridges/Bridge_expo/Bridge_expo.ts',
    'runtime-src/client/TaoRuntimeAPI.ts',
    'runtime-src/client/HMRClient.ts',
    'runtime-src/expo/Metro/MetroPreload.ts',
  ],
  'stdlib': ['stdlib-src/.tao/.gitignore.d.ts'],
  'ts-api': ['ts-api-src/ts-api.ts'],
  'ide-extensions/tao-ide-extension': ['tao-ide-extension-src/extension.ts'],
  'ide-extensions/dev-tao-org': ['dev-tao-org-src/extension.ts'],
}

/** readWorkspaceEntries lists explicit Knip roots and shares them with the test-only usage report. */
export async function readWorkspaceEntries(workspace: string): Promise<WorkspaceEntries> {
  return {
    ...ExternalWorkspaceEntries,
    '0-workspace': ['workspace-src/Workspace.ts'],
    'CLIs': await listCLIEntries(Path.join(workspace, 'CLIs')),
    'repo-analysis': [
      'repo-analysis-src/Performance/parser-sample.ts',
      'repo-analysis-src/Performance/parser-performance.ts',
      'repo-analysis-src/Performance/preview-performance.ts',
      'repo-analysis-src/Performance/Preview/PreviewHarness.ts',
      'repo-analysis-src/Performance/preview-browser.ts',
    ],
  }
}

async function listCLIEntries(directory: string): Promise<string[]> {
  const registries = [
    'CLIs-src/agent-cli/agent-cli.ts',
    'CLIs-src/dev-cli/dev-cli.ts',
    'CLIs-src/tao-cli/tao-cli.ts',
  ]
  return [
    ...registries,
    ...registries.flatMap(registry => listCommandEntries(directory, registry)),
    'CLIs-src/dev-cli/commands/_setup.ts',
    'CLIs-src/dev-cli/commands/_setup-complete.ts',
    'CLIs-src/cli-checks/prepare-cli-generated.ts',
    'CLIs-src/dev-cli/testing/TaoTestWorker.ts',
    ...await listSkillEntries(directory),
  ]
}

function listCommandEntries(directory: string, registry: string): string[] {
  const source = FS.readFileSync(Path.join(directory, registry), 'utf8')
  return [...source.matchAll(Regxs.CommandRegistrationImportRegx)]
    .map(([, specifier]) => Path.posix.join(Path.dirname(registry), specifier!) + '.ts')
}

async function listSkillEntries(directory: string): Promise<string[]> {
  const skillsDirectory = Path.join(directory, 'CLIs-src/agent-skills')
  const entries: string[] = []
  for (const folder of await FS.readdir(skillsDirectory, { withFileTypes: true })) {
    if (!folder.isDirectory()) {
      continue
    }
    const name = folder.name
    const path = Path.join(skillsDirectory, name, `${name}.ts`)
    if (FS.existsSync(path) && FS.statSync(path).isFile()) {
      entries.push(`CLIs-src/agent-skills/${name}/${name}.ts`)
    }
  }
  return entries.sort(Sort.CompareStrings)
}
