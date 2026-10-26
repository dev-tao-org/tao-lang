import { Errors, Try } from '@shared'
import { Path, Storage } from '@shared/os'
import { createProjectDependencyOptions } from './dependencies/Options'
import { ProjectDependencies } from './ProjectDependencies'
import { createProjectPipeline, type ProjectPipelineResult, type ProjectPipelineServices } from './ProjectPipeline'
import { discoverProject } from './projects/Projects'
import { acquireSession, type SessionOptions } from './projects/Sessions'
import { createWorkspace, type WorkspaceOptions } from './Workspace'

/** openProjectWorkspace acquires a project session before opening its independent generated workspace. */
export async function openProjectWorkspace(
  entry: string,
  options: ProjectWorkspaceOptions & SessionOptions & {
    acquireLease?: typeof Storage.acquireCacheLease
  } = {},
) {
  const project = await discoverProject(entry)
    ?? Errors.ThrowUserInput(`No Tao project owns ${entry}. Run tao init <project-directory>.`)
  const session = await acquireSession(project.root, options)
  const releaseCache = await Try(
    () => (options.acquireLease ?? Storage.acquireCacheLease)(`${project.root}:${session.id}`),
    {
      catch(error) {
        session.release()
        return Errors.Throw(error)
      },
    },
  )
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

type ProjectWorkspaceOptions = Omit<WorkspaceOptions, 'directory' | 'outputDirectory' | 'project'> & {
  pipelineServices?: ProjectPipelineServices
}

function managedWorkspace(
  root: string,
  output: string,
  dependencies: ProjectDependencies,
  options: ProjectWorkspaceOptions,
  release: () => void | Promise<void>,
) {
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
  options: ProjectWorkspaceOptions,
): WorkspaceOptions {
  const runtimeOptions = createProjectRuntimeOptions(root, options)
  const pipeline = createProjectPipeline(root, output, runtimeOptions, options.pipelineServices)
  return {
    ...options,
    directory: root,
    outputDirectory: output,
    resolveProject: (importer, alias) => dependencies.resolveProject(importer, alias),
    observeProjectSources: (root, sources) => dependencies.observeProjectSources(root, sources),
    includeModuleRequirements: true,
    watchDirectories: [...dependencies.sourceDirectories(), ...options.watchDirectories ?? []],
    async beforeCompile(program) {
      const managed = await pipeline.beforeCompile(program)
      const custom = await options.beforeCompile?.(program)
      return mergeProjectPreparation(dependencies, managed, custom)
    },
    runtimeOptions,
  }
}

function createProjectRuntimeOptions(root: string, options: ProjectWorkspaceOptions) {
  return {
    toolchainCacheDirectory: Path.join(root, '.tao/cache/runtime-toolchains'),
    ...options.runtimeOptions,
  }
}

function mergeProjectPreparation(
  dependencies: ProjectDependencies,
  managed: ProjectPipelineResult,
  custom: Awaited<ReturnType<NonNullable<WorkspaceOptions['beforeCompile']>>> | undefined,
) {
  return {
    ...managed,
    watchDirectories: [...dependencies.sourceDirectories(), ...managed.watchDirectories],
    ...custom,
  }
}
