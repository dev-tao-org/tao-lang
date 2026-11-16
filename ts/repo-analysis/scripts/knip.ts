import { Path, Repo } from '@shared/os'
import { deriveCompilerPaths, readPackageApis } from '../repo-analysis-src/Workspace/PackageApis'
import { readWorkspaceEntries } from '../repo-analysis-src/Workspace/WorkspaceEntries'
import { readWorkspaceManifestPaths } from '../repo-analysis-src/Workspace/WorkspaceManifests'

const workspace = Repo.resolvePath('ts')
const workspaceEntries = await readWorkspaceEntries(workspace)
const manifests = await readWorkspaceManifestPaths(workspace)
const apis = readPackageApis()

const EmptyCheckPackage = '5-check'

/** knipConfiguration checks package workspaces while recognizing imported command registrations. */
export default {
  workspaces: Object.fromEntries(manifests.map(manifest => {
    const directory = Path.dirname(manifest)
    const name = Path.toPortablePath(Path.relative(workspace, directory))
    return [name, createPackageWorkspace(name, directory)]
  })),
  include: ['enumMembers', 'exports', 'files', 'nsExports', 'nsTypes', 'types'],
}

function createPackageWorkspace(name: string, directory: string) {
  const entry = workspaceEntries[name] ?? []
  return {
    entry: name === EmptyCheckPackage ? [] : [...entry.map(pattern => `${pattern}!`), '**/*.test.ts'],
    project: ['**/*.{ts,tsx}!', '!**/test-*/**!', '!**/*.test.ts!'],
    paths: deriveCompilerPaths(directory, apis),
  }
}
