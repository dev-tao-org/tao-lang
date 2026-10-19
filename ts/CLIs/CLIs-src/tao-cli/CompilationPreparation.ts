import { IO } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Terminal } from '@shared/os'
import { withDependencySession } from '@workspace/ModuleDependencies'
import { prepareProject } from '@workspace/ProjectPreparation'
import { discoverProject } from '@workspace/projects/Projects'

/** compileWithPreparation offers explicit preparation and retry when a compilation lacks dependencies. */
export async function compileWithPreparation(
  entry: string,
  session: string | undefined,
  compile: () => Promise<void>,
): Promise<void> {
  await Try(compile, {
    async catch(error) {
      if (!preparationRequired(String(error))) {
        Errors.Throw(error)
      }
      IO.warn(String(error))
      const accepted = await Terminal.askConfirm({
        message: 'Download and prepare this app’s dependencies now? Rerun compilation after preparation.',
        defaultValue: false,
      })
      if (!accepted) {
        Errors.ThrowUserInput(
          `Dependencies need preparation. Run tao prepare ${JSON.stringify(entry)} --yes, then retry.`,
        )
      }
      const project = await discoverProject(entry) ?? Errors.ThrowUnexpected('The compilation project disappeared.')
      IO.progress('Preparing app dependencies…')
      await withDependencySession(project.root, session, () => prepareProject(entry))
      Errors.ThrowUserInput(`Dependencies prepared. Rerun compilation. Native modules may require a native rebuild.`)
    },
  })
}

function preparationRequired(message: string): boolean {
  return /prepare dependencies|Dependencies changed|Locked source.+missing|npm.+not prepared|Managed npm declarations changed/i
    .test(message)
}
