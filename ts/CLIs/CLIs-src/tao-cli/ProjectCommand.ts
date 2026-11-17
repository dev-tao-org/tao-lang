import { Sort, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import * as Workspace from '@workspace'

/** withProjectSessions runs a mutation while holding stable sessions for every owning project. */
export async function withProjectSessions<Value>(
  paths: readonly string[],
  action: () => Promise<Value>,
  sessionId?: string,
): Promise<Value> {
  const roots = await findOwningProjectRoots(paths)
  return await acquireProjectSessions(roots, sessionId, action)
}

async function findOwningProjectRoots(paths: readonly string[]): Promise<string[]> {
  const roots = new Set<string>()
  for (const path of paths) {
    const project = await Workspace.discoverProject(path)
    if (!project) {
      UserInput.Fail(`No Tao project owns ${path}. Run tao init <path>.`)
    }
    validateProjectPath(path, project.root)
    roots.add(Path.resolve(project.root))
  }
  UserInput.Require(roots.size !== 0, 'A project-scoped command requires at least one path.')
  return [...roots].sort(Sort.CompareStrings)
}

function validateProjectPath(path: string, projectRoot: string): void {
  if (!FS.existsSync(path)) {
    return
  }
  const root = FS.realpathSync(projectRoot)
  const physical = FS.realpathSync(path)
  if (!Path.isWithin(root, physical)) {
    UserInput.Fail(`Project command path escapes its Tao project: ${path}`)
  }
}

type OptionalSessionId = string | undefined
function acquireProjectSessions<Value>(
  roots: readonly string[],
  sessionId: OptionalSessionId,
  action: () => Promise<Value>,
): Promise<Value> {
  const [root, ...remaining] = roots
  if (!root) {
    return action()
  }
  return Workspace.withDependencySession(root, sessionId, () => acquireProjectSessions(remaining, sessionId, action))
}
