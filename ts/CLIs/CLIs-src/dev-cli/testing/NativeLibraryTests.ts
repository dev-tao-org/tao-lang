import { IO } from '@cli-kit'
import type * as Runtime from '@runtime'
import * as Expo from '@runtime/expo'
import { Errors, Try } from '@shared'
import * as Shared from '@shared'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import * as Workspace from '@workspace'
import type { NativeTestPlatform } from './NativeTestDevice'

/** verifyNativeLibrary runs disabled interaction through an ordinary consumer of the compiled Tao library. */
export async function verifyNativeLibrary(
  target: Workspace.AppTestTarget,
  platform: NativeTestPlatform,
): Promise<void> {
  const directory = await prepareConsumerFixture()
  const session = 'native-' + platform
  await Workspace.withConsumerProject(directory, session, host => runLibraryJourney(target, platform, host), platform)
  IO.print(`PASS compiled TypeScript library disabled-controls journey (${platform})`)
}

async function runLibraryJourney(
  target: Workspace.AppTestTarget,
  platform: NativeTestPlatform,
  host: string,
): Promise<void> {
  const expo = await Expo.startConsumerHost(host, platform)
  const device = await target.openDevice()
  await Try(async () => {
    await device.open(expo.url)
    await verifyDisabledLibraryControls(device)
  }, {
    async finally() {
      await Try(() => device.dispose(), { finally: () => closeConsumerHost(host, expo) })
    },
  })
}

async function verifyDisabledLibraryControls(device: Workspace.AppTestDevice): Promise<void> {
  await device.expectText('Lock preview', 'previewLock')
  await device.type('previewInput', 'Before locking')
  await device.expectInput('previewInput', 'Before locking')
  await device.press('previewLock')
  await device.expectText('Programmatic: 1')
  await device.expectInput('previewInput', 'Before locking')
  await device.press('taoPreviewPress')
  await device.press('rawPreviewPress')
  await device.type('previewInput', 'Must not change')
  await device.expectText('Tao presses: 0', 'taoPreviewPress')
  await device.expectText('Raw presses: 0', 'rawPreviewPress')
  await device.expectInput('previewInput', 'Before locking')
  await device.press('previewLock')
  await device.expectText('Lock preview', 'previewLock')
  await device.press('taoPreviewPress')
  await device.press('rawPreviewPress')
  await device.type('previewInput', 'After unlocking')
  await device.expectText('Tao presses: 1', 'taoPreviewPress')
  await device.expectText('Raw presses: 1', 'rawPreviewPress')
  await device.expectInput('previewInput', 'After unlocking')
  await device.expectText('Programmatic: 1')
}

async function closeConsumerHost(host: string, expo: Runtime.ExpoSession): Promise<void> {
  await expo.dispose()
  const { stdout, stderr } = await expo.output()
  await FS.writeFile(Path.join(host, 'expo.log'), Shared.joinTextLines(stdout, stderr))
}

async function prepareConsumerFixture(): Promise<string> {
  const source = Repo.resolvePath('Apps/TS Lib App/src')
  const directory = Artifacts.resolvePath('tmp', 'native-ts-consumer-' + Platform.randomUUID())
  Artifacts.trackTemporary(directory)
  await Workspace.initializeProject(directory)
  await FS.cp(Path.join(source, 'tao'), Path.join(directory, 'src/tao'), { recursive: true })
  const packageDirectory = Path.join(directory, 'src/ts')
  await FS.mkdir(packageDirectory)
  for (
    const filename of [
      'Consumer.tsx',
      'DisabledPreviewDemo.tsx',
      'ForeignGreeting.tsx',
      'package.json',
      'tsconfig.json',
    ]
  ) {
    await FS.copyFile(Path.join(source, 'ts', filename), Path.join(packageDirectory, filename))
  }
  await linkConsumerDependencies(directory, packageDirectory)
  return packageDirectory
}

async function linkConsumerDependencies(directory: string, packageDirectory: string): Promise<void> {
  const modules = Path.join(packageDirectory, 'node_modules')
  await FS.mkdir(Path.join(modules, '@example'))
  await FS.symlink(
    Path.join(directory, '.tao/cache/libraries/Demo'),
    Path.join(modules, '@example/tao-library'),
    'dir',
  )
  const runtimeModules = Repo.resolvePath('ts/7-runtime/node_modules')
  for (
    const name of [
      '@expo/metro-runtime',
      '@preact/signals-core',
      'expo',
      'react',
      'react-dom',
      'react-native',
      'react-native-web',
      '.bin',
    ]
  ) {
    const source = Path.join(runtimeModules, name)
    const link = Path.join(modules, name)
    if (!FS.existsSync(source)) {
      Errors.ThrowHostEnvironment(`Missing pinned dependency needed by the TS consumer: ${source}`)
    }
    await FS.mkdir(Path.dirname(link))
    await FS.symlink(FS.realpathSync(source), link, 'dir')
  }
}
