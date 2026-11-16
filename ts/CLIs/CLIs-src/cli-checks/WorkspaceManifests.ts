import { Errors, Schema } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { assertNewWorkspacePath } from './check'

const WorkspaceManifestSchema = Schema.object({ workspaces: Schema.array(Schema.string()) })
const ManifestFilename = 'package.json'

/** readWorkspaceManifestPaths discovers packages declared by the TypeScript workspace. */
export async function readWorkspaceManifestPaths(workspace: string): Promise<string[]> {
  const filename = Path.join(workspace, ManifestFilename)
  assertNewWorkspacePath(filename, workspace)
  const { workspaces } = await FS.readJson(filename, { schema: WorkspaceManifestSchema })
  const includes = workspaces.map(toManifestGlob)
  const manifests = TypeScript.sys.readDirectory(workspace, ['.json'], ['**/node_modules/**'], includes)
  for (const manifest of manifests) {
    assertNewWorkspacePath(manifest, workspace)
  }
  return manifests
}

function toManifestGlob(pattern: string): string {
  const portable = Path.toPortablePath(pattern)
  if (Path.win32.parse(portable).root || portable.split('/').includes('..')) {
    Errors.ThrowUserInput(`Workspace package globs must stay inside ts/: ${pattern}`)
  }
  return Path.posix.join(portable, ManifestFilename)
}
