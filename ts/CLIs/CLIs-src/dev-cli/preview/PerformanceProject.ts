import { IO } from '@cli-kit'
import * as Performance from '@repo-analysis/performance'
import * as Runtime from '@runtime'
import { Artifacts, FS, Path, Repo } from '@shared/os'
import { prepareRuntime } from '../../cli-checks/runtime-build'

/** startPerformanceEditor serves one visible cycle in an isolated performance project. */
export async function startPerformanceEditor(): Promise<Performance.PerformanceHarness> {
  const options = await preparePreviewProject()
  const measurement = { editCount: Performance.PreviewCycleSize }
  const harness = await Performance.openPerformanceHarness({ ...options, measurement })
  IO.print('Performance editor: ' + harness.url)
  return harness
}

/** preparePreviewProject creates the canonical test project and its compiler session. */
export async function preparePreviewProject(initialSource?: string): Promise<Performance.PreviewOptions> {
  await prepareRuntime()
  const Workspace = await import('@workspace')
  const project = await Workspace.createProject()
  const dependencies = await Workspace.createProjectDependencyOptions(project.directory)
  await Workspace.prepareDependencies(
    project.directory,
    await dependencies.readRequirements(project.directory),
    dependencies,
  )
  const runtimeOptions = { toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains') }
  await Runtime.prepareRuntime({
    ...runtimeOptions,
    install: {
      async install(directory) {
        await FS.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  })
  return {
    project,
    workspace: await Workspace.openProjectWorkspace(project.directory, {
      id: 'performance',
      runtimeOptions,
    }),
    initialSource: initialSource ?? await Performance.readPerformanceFixture(),
  }
}
