import * as CLIKit from '@cli-kit'
import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { Env, Path, Platform, Repo } from '@shared/os'
import { workspaceTests } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import check from './check'
import compile from './compile'
import fmt from './fmt'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, verify review builds, and test the workspace and Tao journeys on web and iOS.',
  arguments: [{
    name: 'format-paths',
    description: 'Limit formatting to named files or globs; checks stay workspace-wide.',
    variadic: true,
  }],
  options: [
    { flags: '--yes', description: 'Authorize required app dependency setup.' },
    { flags: '--web-only', description: 'Run portable checks and web tests as an explicitly scoped verification.' },
  ],
  async action(paths: string[], options: { yes?: boolean; webOnly?: boolean } = {}) {
    const nativeSteps = options.webOnly ? [] : createNativeVerificationSteps(options.yes)
    await CLIKit.runSteps(
      () => fmt.action(paths),
      () => verifyReviewBuilds(options),
      () => check.action(),
      () => workspaceTests([], undefined, { yes: options.yes }),
      ...nativeSteps,
    )
  },
})

function createNativeVerificationSteps(yes?: boolean): Array<() => Promise<void>> {
  IO.warn('Local Android verification is not enabled yet.')
  if (Platform.systemInfo().os !== 'Darwin') {
    Errors.ThrowHostEnvironment('Full verification needs iOS Simulator on macOS. Use --web-only for portable checks.')
  }
  const ios = Env.get('TAO_IOS_EXPO_GO')
  if (ios === undefined) {
    Errors.ThrowUserInput('Set TAO_IOS_EXPO_GO to the Expo Go app for iOS Simulator.')
  }
  return [
    async () =>
      (await import('../testing/NativeTaoTests')).runNativeTaoTests(
        'ios',
        Repo.resolvePath(ios),
        Repo.getWorkspaceRoot(),
        yes,
      ),
  ]
}

async function verifyReviewBuilds(options: { yes?: boolean }): Promise<void> {
  await CLIKit.runSteps(
    () =>
      compile.action(Repo.resolvePath(KitchenSink), {
        session: ReviewSession,
        yes: options.yes,
      }),
    () => compile.action('Demo', { package: Repo.resolvePath(LibraryConsumer), session: ReviewSession }),
    checkKitchenSinkBuild,
  )
}

const ReviewSession = 'review-build'
const KitchenSink = 'Apps/Dev/Kitchen Sink/Kitchen Sink.tao'
const LibraryConsumer = 'Apps/TS Lib App/src/ts'
const KitchenSinkBuild = `Apps/Dev/.tao/cache/sessions/${ReviewSession}/build`

async function checkKitchenSinkBuild(): Promise<void> {
  const config = Path.join(KitchenSinkBuild, 'tsconfig.json')
  await CLIKit.runNonInteractiveCommand('tsc', ['--project', config, '--noEmit'], {
    cwd: Repo.getWorkspaceRoot(),
  })
}
