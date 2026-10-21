import { Errors } from '@shared'
import { Path, Tests } from '@shared/os'
import { projectDependencyOptions } from '../../workspace-src/dependencies/Options'
import type { ProjectPipelineServices } from '../../workspace-src/ProjectPipeline'
import { inspectProjectPreparation, prepareProject } from '../../workspace-src/ProjectPreparation'
import type { BunExecutor } from '../../workspace-src/sidecars/ManagedModules'
import { execute } from '../../workspace-src/Workflow'

/** openAutomaticWorkspace proves real setup and automatic continuation with a fixture-owned local registry. */
export async function openAutomaticWorkspace(
  entry: string,
  published: string[],
  executor: BunExecutor,
  runtimePins: Record<string, string>,
  pipelineServices: ProjectPipelineServices,
) {
  const dependencyOptions = await projectDependencyOptions(Path.dirname(entry))
  let prompts = 0
  const workspace = await execute({
    kind: 'compile',
    entry,
    options: {
      id: 'managed-acceptance',
      async publish(output) {
        published.push(output.code)
      },
      acquireLease: async () => () => {},
      pipelineServices,
    },
  }, {
    async confirm() {
      prompts++
      return true
    },
  }, {
    inspect: path => inspectProjectPreparation(path, { runtimePins }),
    setup: path =>
      prepareProject(path, {
        executor,
        runtimePins,
        dependencyOptions: {
          ...dependencyOptions,
          git: {
            resolveCommit: async () => Errors.ThrowShouldNeverHappen('An unreachable source must not resolve.'),
            fetchCommit: async () => Errors.ThrowShouldNeverHappen('An unreachable source must not download.'),
          },
        },
      }),
  })
  Tests.expect(prompts).toBe(1)
  Tests.expect(workspace.initialResult.status).toBe('published')
  return workspace
}
