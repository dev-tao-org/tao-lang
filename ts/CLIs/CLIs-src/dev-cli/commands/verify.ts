import * as CLIKit from '@cli-kit'
import { Errors } from '@shared'
import { Env, Platform, Repo } from '@shared/os'
import { workspaceTests } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import check from './check'
import fmt from './fmt'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, check and verify the TypeScript workspace and Tao journeys on web, iOS and Android.',
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
      () => check.action(),
      () => workspaceTests([], undefined, { yes: options.yes }),
      ...nativeSteps,
    )
  },
})

function createNativeVerificationSteps(yes?: boolean): Array<() => Promise<void>> {
  const root = Repo.getWorkspaceRoot()
  const binaries = requireNativeVerificationTools()
  return [
    async () => (await import('../testing/NativeTaoTests')).runNativeTaoTests('ios', binaries.ios, root, yes),
    async () => (await import('../testing/NativeTaoTests')).runNativeTaoTests('android', binaries.android, root, yes),
  ]
}

function requireNativeVerificationTools() {
  if (Platform.systemInfo().os !== 'Darwin') {
    Errors.ThrowHostEnvironment('Full verification needs iOS Simulator on macOS. Use --web-only for portable checks.')
  }
  const ios = Env.get('TAO_IOS_EXPO_GO')
  const android = Env.get('TAO_ANDROID_EXPO_GO')
  if (ios === undefined || android === undefined) {
    Errors.ThrowUserInput('Set TAO_IOS_EXPO_GO to the simulator app and TAO_ANDROID_EXPO_GO to the emulator APK.')
  }
  return { ios: Repo.resolvePath(ios), android: Repo.resolvePath(android) }
}
