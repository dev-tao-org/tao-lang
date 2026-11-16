import { IO } from '@cli-kit'
import { Errors, Try } from '@shared'
import * as Shared from '@shared'
import { Artifacts, Env, FileLock, FS, HttpServer, Path, Platform, Repo, Storage } from '@shared/os'
import Exec, { type PipedChildProcess, type ProcessOutput } from '@shared/os/exec'
import { Addr, Http } from '@shared/web'
import { expoGoApplicationId, type NativeTestPlatform } from './NativeTestDevice'
import { type NativeWebDriver, openNativeWebDriver, waitForNativeObservation } from './NativeWebDriver'

/** withNativeTestHost installs Expo Go on an isolated device and owns its Appium session. */
export async function withNativeTestHost(
  platform: NativeTestPlatform,
  binary: string,
  run: RunNativeCases,
): Promise<void> {
  const root = Artifacts.resolvePath('logs', 'native-journeys', Platform.randomUUID())
  await FS.mkdir(root)
  IO.progress(`Native ${platform} host logs: ${root}`)
  await requireRuntimeBinary(binary)
  const locks = Storage.resolveCacheDirectory('native-journeys')
  await FS.mkdir(locks)
  const lock = await FileLock.tryAcquire(Path.join(locks, platform + '.lock'))
  if (!lock) {
    Errors.ThrowHostEnvironment(`Another Tao verification owns the ${platform} test host.`)
  }
  await Try(
    () => platform === 'ios' ? withSimulator(root, binary, run) : withEmulator(root, binary, run),
    { finally: () => lock.release() },
  )
}

type RunNativeCases = (driver: NativeWebDriver, clearAppData?: () => Promise<void>) => Promise<void>
type NativeTarget = {
  platform: NativeTestPlatform
  id: string
  root: string
}

async function requireRuntimeBinary(binary: string): Promise<void> {
  if (!await FS.exists(binary)) {
    Errors.ThrowUserInput(`Expo Go runtime not found: ${binary}`)
  }
}

async function withSimulator(root: string, binary: string, run: RunNativeCases): Promise<void> {
  if (Platform.systemInfo().os !== 'Darwin') {
    Errors.ThrowHostEnvironment('iOS journeys require a macOS host with the iOS Simulator runtime.')
  }
  await requireNoSimulatorViewer()
  const type = Env.get('TAO_IOS_SIMULATOR_TYPE') ?? 'com.apple.CoreSimulator.SimDeviceType.iPhone-17e'
  const id = await simctl(['create', 'Tao Journeys ' + Path.basename(root), type])
  const target: NativeTarget = { platform: 'ios', id, root }
  await Try(async () => {
    await simctl(['boot', id])
    await simctl(['bootstatus', id, '-b'])
    await simctl(['install', id, binary])
    await requireNoSimulatorViewer()
    await withAppium(target, run)
  }, {
    async finally() {
      await Try(() => simctl(['shutdown', id]), { finally: () => simctl(['delete', id]) })
    },
  })
}

async function requireNoSimulatorViewer(): Promise<void> {
  const viewer = await Exec.capture('pgrep', ['-x', 'Simulator'], { check: false, timeoutMs: 3000 })
  if (viewer.status !== 1) {
    Errors.ThrowHostEnvironment(
      'Close the Simulator viewer before a headless native journey. Appium can quit an open viewer.',
    )
  }
}

function simctl(args: readonly string[]): Promise<string> {
  return Exec.captureStdout('xcrun', ['simctl', ...args], { timeoutMs: 180_000 })
}

const EmulatorPort = 5570
const EmulatorSerial = 'emulator-' + EmulatorPort
async function withEmulator(root: string, binary: string, run: RunNativeCases): Promise<void> {
  const { stdout } = await Exec.capture('adb', ['devices'], { timeoutMs: 10_000 })
  if (stdout.includes(EmulatorSerial)) {
    Errors.ThrowHostEnvironment(`Android emulator port is already in use: ${EmulatorPort}`)
  }
  const environment = await prepareAndroidDevice(root)
  const child = Exec.spawn('emulator', emulatorArguments(), { addEnv: environment })
  const output = Exec.captureProcessOutput(child)
  await Try(async () => {
    await waitForEmulator(child)
    await adb(['install', binary], 120_000)
    const target: NativeTarget = { platform: 'android', id: EmulatorSerial, root }
    await withAppium(target, run)
  }, {
    finally: () => disposeEmulator(child, output, root),
  })
}

async function prepareAndroidDevice(root: string) {
  const directory = Path.join(root, 'android')
  await FS.mkdir(directory)
  const environment = { ANDROID_USER_HOME: directory, ANDROID_AVD_HOME: Path.join(directory, 'avd') }
  const arch = Platform.systemInfo().architecture
  const abi = arch === 'arm64' ? 'arm64-v8a' : 'x86_64'
  await Exec.capture('avdmanager', [
    'create',
    'avd',
    '-k',
    `system-images;android-36;google_apis;${abi}`,
    '-n',
    'tao-journey',
  ], {
    addEnv: environment,
    stdin: 'no\n',
    timeoutMs: 60_000,
  })
  return environment
}

function emulatorArguments(): string[] {
  return [
    '-avd',
    'tao-journey',
    '-port',
    String(EmulatorPort),
    '-no-window',
    '-no-audio',
    '-no-snapshot',
    '-no-boot-anim',
    '-gpu',
    'swiftshader',
    '-memory',
    '2048',
  ]
}

type CapturedOutput = Promise<ProcessOutput>

async function waitForEmulator(child: PipedChildProcess): Promise<void> {
  await waitForNativeObservation('booted Android emulator', async () => {
    if (child.exitCode !== null) {
      Errors.ThrowHostEnvironment('Android emulator exited before boot. See emulator.log.')
    }
    const boot = await Exec.capture('adb', ['-s', EmulatorSerial, 'shell', 'getprop', 'sys.boot_completed'], {
      check: false,
      timeoutMs: 5000,
    })
    return boot.stdout.trim() === '1' ? true : undefined
  }, 180_000)
}

function adb(args: readonly string[], timeoutMs: number): Promise<string> {
  return Exec.captureStdout('adb', ['-s', EmulatorSerial, ...args], { timeoutMs })
}

async function clearAndroidExpoGo(): Promise<void> {
  // Android Expo Go otherwise restores the previous project with the same Expo slug.
  const result = await adb(['shell', 'pm', 'clear', expoGoApplicationId('android')], 10_000)
  if (result !== 'Success') {
    Errors.ThrowHostEnvironment(`Could not reset Expo Go on the owned emulator: ${result}`)
  }
}

async function withAppium(target: NativeTarget, run: RunNativeCases): Promise<void> {
  const driverName = target.platform === 'ios' ? 'xcuitest' : 'uiautomator2'
  const home = await prepareAppiumHome(target.root, driverName)
  const port = reservePort()
  const args = createAppiumArguments(target, port, driverName)
  const child = Exec.spawn('appium', args, {
    cwd: Repo.resolvePath('ts/CLIs'),
    addEnv: { APPIUM_HOME: home },
  })
  const output = Exec.captureProcessOutput(child)
  const url = Addr.localhostUrl(port)
  await Try(async () => {
    await waitForAppium(child, url)
    const capabilities = await capabilitiesForTarget(target)
    const driver = await openNativeWebDriver(url, capabilities)
    const clearAppData = target.platform === 'android' ? clearAndroidExpoGo : undefined
    await Try(() => run(driver, clearAppData), { finally: () => driver.close() })
  }, {
    finally: () => stopWithLogs(child, output, Path.join(target.root, 'appium-process.log')),
  })
}

function createAppiumArguments(target: NativeTarget, port: number, driverName: string): string[] {
  return [
    '--address',
    Addr.Localhost,
    '--port',
    String(port),
    '--use-drivers',
    driverName,
    '--log',
    Path.join(target.root, 'appium.log'),
    '--log-no-colors',
  ]
}

async function prepareAppiumHome(root: string, driverName: string): Promise<string> {
  const home = Path.join(root, 'appium')
  const modules = Path.join(home, 'node_modules')
  await FS.mkdir(modules)
  const driverPackage = `appium-${driverName}-driver`
  const source = FS.realpathSync(Repo.resolvePath('ts/CLIs/node_modules/' + driverPackage))
  await FS.symlink(source, Path.join(modules, driverPackage), 'dir')
  await FS.writeJson(Path.join(home, 'package.json'), { devDependencies: { [driverPackage]: 'file:' + source } })
  return home
}

async function waitForAppium(child: PipedChildProcess, url: string): Promise<void> {
  await waitForNativeObservation('a ready Appium server', async () => {
    if (child.exitCode !== null) {
      Errors.ThrowHostEnvironment('Appium exited during startup. See appium.log.')
    }
    const response = await Try.WithDefault(undefined, () => Http.request(url + '/status'))
    return response?.ok ? response : undefined
  })
}

function reservePort(): number {
  const probe = HttpServer.serve({ hostname: Addr.Localhost, port: 0, fetch: () => Http.response() })
  const port = probe.port ?? Errors.ThrowShouldNeverHappen('Could not reserve a local Appium port.')
  probe.stop(true)
  return port
}

async function capabilitiesForTarget(target: NativeTarget) {
  const appId = expoGoApplicationId(target.platform)
  return target.platform === 'ios'
    ? iosCapabilities(target, appId, await prepareWebDriverAgentCache())
    : androidCapabilities(target, appId)
}

async function prepareWebDriverAgentCache(): Promise<string> {
  const [xcode, sdk, lock] = await Promise.all([
    Exec.captureStdout('xcrun', ['xcodebuild', '-version'], { timeoutMs: 10_000 }),
    Exec.captureStdout('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-build-version'], { timeoutMs: 10_000 }),
    FS.readFile(Repo.resolvePath('ts/bun.lock'), 'utf8'),
  ])
  const fingerprint = Platform.hashText(Shared.joinTextLines(Platform.systemInfo().architecture, xcode, sdk, lock))
  const cache = Artifacts.resolvePath('cache', 'native-journeys', 'wda', fingerprint)
  await FS.mkdir(cache)
  return cache
}

function iosCapabilities(target: NativeTarget, bundleId: string, derivedDataPath: string) {
  return {
    'platformName': 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:udid': target.id,
    'appium:bundleId': bundleId,
    'appium:noReset': true,
    'appium:isHeadless': true,
    'appium:forceSimulatorSoftwareKeyboardPresence': true,
    'appium:newCommandTimeout': 120,
    'appium:wdaLocalPort': reservePort(),
    'appium:derivedDataPath': derivedDataPath,
  }
}

function androidCapabilities(target: NativeTarget, appPackage: string) {
  return {
    'platformName': 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': target.id,
    'appium:appPackage': appPackage,
    'appium:appActivity': '.LauncherActivity',
    'appium:noReset': true,
    'appium:newCommandTimeout': 120,
    'appium:systemPort': reservePort(),
  }
}

async function stopWithLogs(child: PipedChildProcess, output: CapturedOutput, path: string): Promise<void> {
  await Exec.stopProcess(child)
  const { stdout, stderr } = await output
  await FS.writeFile(path, Shared.joinTextLines(stdout, stderr))
}

async function disposeEmulator(child: PipedChildProcess, output: CapturedOutput, root: string): Promise<void> {
  await Try(() => stopWithLogs(child, output, Path.join(root, 'emulator.log')), {
    finally: () => FS.rm(Path.join(root, 'android'), { recursive: true, force: true }),
  })
}
