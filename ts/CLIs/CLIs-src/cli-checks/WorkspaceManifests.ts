import { Json, Schema } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

const WorkspaceManifestSchema = Schema.object({ workspaces: Schema.array(Schema.string()) })
const ManifestFilename = 'package.json'

/** readWorkspaceManifestPaths discovers packages declared by the TypeScript workspace. */
export function readWorkspaceManifestPaths(workspace: string): string[] {
  const filename = Path.join(workspace, ManifestFilename)
  const { workspaces } = Json.Parse(FS.readFileSync(filename, 'utf8'), {
    schema: WorkspaceManifestSchema,
    sourceName: filename,
  })
  const includes = workspaces.map(pattern => Path.posix.join(pattern, ManifestFilename))
  return TypeScript.sys.readDirectory(workspace, ['.json'], ['**/node_modules/**'], includes)
}
