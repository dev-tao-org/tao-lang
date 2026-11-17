import { Json, Schema, UserInput } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'

const WorkspaceManifestSchema = Schema.object({ workspaces: Schema.array(Schema.string()) })
const ManifestFilename = 'package.json'

/** readWorkspaceManifestPaths discovers packages declared by the TypeScript workspace. */
export function readWorkspaceManifestPaths(workspace: string): string[] {
  const filename = Path.join(workspace, ManifestFilename)
  Repo.assertNewWorkspacePath(filename, workspace)
  const source = FS.readFileSync(filename, 'utf8')
  const { workspaces } = Json.Parse(source, { schema: WorkspaceManifestSchema, sourceName: filename })
  const includes = workspaces.map(toManifestGlob)
  const manifests = TypeScript.sys.readDirectory(workspace, ['.json'], ['**/node_modules/**'], includes)
  for (const manifest of manifests) {
    Repo.assertNewWorkspacePath(manifest, workspace)
  }
  return [...new Set(manifests)].sort()
}

function toManifestGlob(pattern: string): string {
  const portable = Path.toPortablePath(pattern)
  if (Path.win32.parse(portable).root || portable.split('/').includes('..')) {
    UserInput.Fail(`Workspace package globs must stay inside ts/: ${pattern}`)
  }
  return Path.posix.join(portable, ManifestFilename)
}
