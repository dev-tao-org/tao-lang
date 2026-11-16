import { deriveCompilerPaths } from '../CLIs/CLIs-src/cli-checks/PackageApis'
import { readWorkspaceEntries } from '../CLIs/CLIs-src/cli-checks/WorkspaceEntries'
import { Repo } from '../shared/shared-src/os'

const workspaceEntries = await readWorkspaceEntries(Repo.resolvePath('ts'))

/** knipConfiguration checks package workspaces while recognizing imported command registrations. */
export default {
  workspaces: {
    '0-workspace': createPackageWorkspace('0-workspace'),
    '1-grammar': createPackageWorkspace('1-grammar'),
    '2-ast-gen': createPackageWorkspace('2-ast-gen'),
    '3-typecheck': createPackageWorkspace('3-typecheck'),
    '4-fix': createPackageWorkspace('4-fix'),
    '5-check': { ...createPackageWorkspace('5-check'), entry: [] },
    '6-compile': createPackageWorkspace('6-compile'),
    '7-runtime': createPackageWorkspace('7-runtime'),
    'CLIs': createPackageWorkspace('CLIs'),
    'perf': createPackageWorkspace('perf'),
    'shared': createPackageWorkspace('shared'),
    'stdlib': createPackageWorkspace('stdlib'),
    'ts-api': createPackageWorkspace('ts-api'),
    'ide-extensions/tao-ide-extension': createNestedPackageWorkspace('ide-extensions/tao-ide-extension'),
    'ide-extensions/dev-tao-org': createNestedPackageWorkspace('ide-extensions/dev-tao-org'),
  },
  include: ['enumMembers', 'exports', 'files', 'nsExports', 'nsTypes', 'types'],
}

function createPackageWorkspace(name: string) {
  const entry = workspaceEntries[name] ?? []
  return {
    entry: [...entry.map(pattern => `${pattern}!`), '**/*.test.ts'],
    project: ['**/*.{ts,tsx}!', '!**/test-*/**!', '!**/*.test.ts!'],
    paths: deriveCompilerPaths(Repo.resolvePath('ts/package')),
  }
}

function createNestedPackageWorkspace(name: string) {
  const configuration = createPackageWorkspace(name)
  return {
    ...configuration,
    paths: Object.fromEntries(
      Object.entries(configuration.paths).map(([name, paths]) => [name, paths.map(path => `../${path}`)]),
    ),
  }
}
