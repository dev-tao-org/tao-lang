import { Errors, Try } from '@shared'
import { Path, Storage } from '@shared/os'
import { createProjectDependencyOptions } from './dependencies/Options'
import { ProjectDependencies } from './ProjectDependencies'
import { createProjectPipeline, type ProjectPipelineResult } from './ProjectPipeline'
import { discoverProject } from './projects/Projects'
import { acquireSession, type SessionOptions } from './projects/Sessions'
import { createWorkspace, type WorkspaceOptions, type WorkspaceSession } from './Workspace'
import type { WorkspacePreparation } from './Workspace'

/** ProjectWorkspaceOptions configures a managed project workspace and its session lifetime. */
export type ProjectWorkspaceOptions = Omit<WorkspaceOptions, ProjectWorkspaceOption> & SessionOptions
/** openProjectWorkspace acquires a project session before opening its independent generated workspace. */
export async function openProjectWorkspace(
  entry: string,
  options: ProjectWorkspaceOptions = {},
): Promise<WorkspaceSession> {
  const project = await discoverProject(entry)
  if (!project) {
    Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <project-directory>.`)
  }
  const session = await acquireSession(project.root, options)
  const identity = `${project.root}:${session.id}`
  const releaseCache = await Try(() => Storage.acquireCacheLease(identity), {
    catch(error) {
      session.release()
      return Errors.Throw(error)
    },
  })
  const release = () => Try(releaseCache, { finally: () => session.release() })
  return await Try(async () => {
    const dependencies = new ProjectDependencies(project.root, await createProjectDependencyOptions(project.root))
    await dependencies.refresh()
    return managedWorkspace(project.root, session.directory, dependencies, options, release)
  }, {
    async catch(error) {
      await release()
      return Errors.Throw(error)
    },
  })
}

type ProjectWorkspaceOption = 'directory' | 'outputDirectory' | 'project'
type ManagedWorkspaceOptions = Omit<WorkspaceOptions, ProjectWorkspaceOption>

type WorkspaceReleaseResult = void | Promise<void>
type WorkspaceRelease = () => WorkspaceReleaseResult

function managedWorkspace(
  root: string,
  output: string,
  dependencies: ProjectDependencies,
  options: ManagedWorkspaceOptions,
  release: WorkspaceRelease,
): WorkspaceSession {
  const workspaceOptions = createManagedWorkspaceOptions(root, output, dependencies, options)
  const workspace = createWorkspace(workspaceOptions)
  const dispose = workspace.dispose.bind(workspace)
  workspace.dispose = () => Try(dispose, { finally: release })
  return workspace
}

function createManagedWorkspaceOptions(
  root: string,
  output: string,
  dependencies: ProjectDependencies,
  options: ManagedWorkspaceOptions,
): WorkspaceOptions {
  const runtimeOptions = createProjectRuntimeOptions(root, options)
  const pipeline = createProjectPipeline(root, output, runtimeOptions)
  return {
    ...options,
    directory: root,
    outputDirectory: output,
    resolveProject: (importer, alias) => dependencies.resolveProject(importer, alias),
    observeProjectSources: (root, sources) => dependencies.observeProjectSources(root, sources),
    includeModuleRequirements: true,
    watchDirectories: [...dependencies.sourceDirectories(), ...options.watchDirectories ?? []],
    async beforeCompile(program, watchAttemptedFiles) {
      const managed = await pipeline.beforeCompile(program, watchAttemptedFiles)
      const custom = await options.beforeCompile?.(program, watchAttemptedFiles)
      return mergeProjectPreparation(dependencies, managed, custom)
    },
    runtimeOptions,
  }
}

function createProjectRuntimeOptions(root: string, options: ManagedWorkspaceOptions) {
  return {
    toolchainCacheDirectory: Path.join(root, '.tao/cache/runtime-toolchains'),
    ...options.runtimeOptions,
  }
}

function mergeProjectPreparation(
  dependencies: ProjectDependencies,
  managed: ProjectPipelineResult,
  custom?: WorkspacePreparation,
) {
  return {
    ...managed,
    watchDirectories: [...dependencies.sourceDirectories(), ...managed.watchDirectories],
    ...custom,
  }
}
