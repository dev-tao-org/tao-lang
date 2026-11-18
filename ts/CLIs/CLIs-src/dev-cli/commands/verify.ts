import * as CLIKit from '@cli-kit'
import { Path, Repo } from '@shared/os'
import { workspaceTests } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import check from './check'
import compile from './compile'
import fmt from './fmt'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, regenerate and typecheck the review builds, then check and test the workspace.',
  arguments: [{
    name: 'format-paths',
    description: 'Limit formatting to named files or globs; checks stay workspace-wide.',
    variadic: true,
  }],
  options: [{ flags: '--yes', description: 'Authorize required app dependency setup.' }],
  async action(paths: string[], options: { yes?: boolean } = {}) {
    // Native app journeys await their testing implementation.
    await CLIKit.runSteps(
      () => fmt.action(paths),
      () => verifyReviewBuilds(options),
      () => check.action(),
      () => workspaceTests([], undefined, { yes: options.yes }),
    )
  },
})

async function verifyReviewBuilds(options: { yes?: boolean }): Promise<void> {
  await CLIKit.runSteps(
    () =>
      compile.action(Repo.resolvePath(KitchenSink), {
        session: ReviewSession,
        yes: options.yes,
      }),
    () =>
      compile.action('Demo', {
        package: Repo.resolvePath(LibraryConsumer),
        session: ReviewSession,
        yes: options.yes,
      }),
    () => checkReviewBuild(KitchenSinkBuild),
    () => checkReviewBuild(LibraryBuild),
  )
}

const ReviewSession = 'review-build'
const KitchenSink = 'Apps/Dev/Kitchen Sink/Kitchen Sink.tao'
const LibraryConsumer = 'Apps/TS Lib App/src/ts'
const KitchenSinkBuild = `Apps/Dev/.tao/cache/sessions/${ReviewSession}/build`
const LibraryBuild = `Apps/TS Lib App/.tao/cache/sessions/${ReviewSession}/libraries/Demo/ts`

async function checkReviewBuild(directory: string): Promise<void> {
  const config = Path.join(directory, 'tsconfig.json')
  await CLIKit.runNonInteractiveCommand('tsc', ['--project', config, '--noEmit'], {
    cwd: Repo.getWorkspaceRoot(),
  })
}
