import { Errors, NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'
import { Path } from '@shared/os'
import { createProjectDependencyOptions } from '../workspace-src/dependencies/Options'
import type { ProjectPipelineServices } from '../workspace-src/ProjectPipeline'
import { inspectProjectPreparation, prepareProject } from '../workspace-src/ProjectPreparation'
import type { BunExecutor } from '../workspace-src/sidecars/ManagedModule/ManagedModules'
import type { ManagedRuntimePins } from '../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'
import { execute } from '../workspace-src/Workflow'

/** openAutomaticWorkspace proves real setup and automatic continuation with a fixture-owned local registry. */
export async function openAutomaticWorkspace(
  entry: string,
  published: string[],
  executor: BunExecutor,
  runtimePins: ManagedRuntimePins,
  pipelineServices: ProjectPipelineServices,
) {
  const dependencyOptions = await createProjectDependencyOptions(Path.dirname(entry))
  let prompts = 0
  const workspace = await execute({
    kind: 'compile',
    entry,
    options: {
      id: 'managed-acceptance',
      async publish(output) {
        published.push(Object.values(output.files).join(NewlineCharacter))
      },
      acquireLease: async () => () => {},
      // Explicit openFile calls drive refreshes in this setup acceptance test.
      watch: async () => ({ async dispose() {} }),
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
