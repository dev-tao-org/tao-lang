import { Errors } from '@shared'
import { FileSystem, Path, Storage } from '@shared/os'
import { withDependencySession } from '@workspace/ModuleDependencies'
import { discoverProject } from '@workspace/projects/Projects'
import type { BunExecutor } from '@workspace/sidecars/ManagedModules'

/** withProjectSessions runs a mutation while holding stable sessions for every owning project. */
export async function withProjectSessions<Value>(
  paths: readonly string[],
  action: () => Promise<Value>,
  sessionId?: string,
  acquireLease: (identity: string) => Promise<() => void> = Storage.acquireCacheLease,
): Promise<Value> {
  const roots = await owningProjectRoots(paths)
  return await acquireProjectSessions(roots, sessionId, acquireLease, action)
}

/** runSidecarTests invokes the pinned Bun test runner from one local module directory. */
export async function runSidecarTests(
  moduleRoot: string,
  executor: BunExecutor,
): Promise<void> {
  const result = await executor('bun', ['test'], moduleRoot)
  if (result.status !== 0) {
    Errors.ThrowUserInput(`Sidecar tests failed in ${moduleRoot}. ${result.stderr || result.stdout}`)
  }
}

async function owningProjectRoots(paths: readonly string[]): Promise<string[]> {
  const roots = new Set<string>()
  for (const path of paths) {
    const project = await discoverProject(path)
    if (!project) {
      Errors.ThrowUserInput(`No Tao project owns ${path}. Run tao init <path>.`)
    }
    validateProjectPath(path, project.root)
    roots.add(Path.resolve(project.root))
  }
  if (roots.size === 0) {
    Errors.ThrowUserInput('A project-scoped command requires at least one path.')
  }
  return [...roots].sort()
}

function validateProjectPath(path: string, projectRoot: string): void {
  if (!FileSystem.existsSync(path)) {
    return
  }
  const root = FileSystem.realpathSync(projectRoot)
  const physical = FileSystem.realpathSync(path)
  const relative = Path.relative(root, physical)
  if (relative === '..' || relative.startsWith('../') || Path.isAbsolute(relative)) {
    Errors.ThrowUserInput(`Project command path escapes its Tao project: ${path}`)
  }
}

function acquireProjectSessions<Value>(
  roots: readonly string[],
  sessionId: string | undefined,
  acquireLease: (identity: string) => Promise<() => void>,
  action: () => Promise<Value>,
): Promise<Value> {
  const [root, ...remaining] = roots
  if (!root) {
    return action()
  }
  return withDependencySession(
    root,
    sessionId,
    () => acquireProjectSessions(remaining, sessionId, acquireLease, action),
    acquireLease,
  )
}
