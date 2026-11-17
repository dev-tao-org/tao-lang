import { IO } from '@cli-kit'
import { Errors, Json, Schema, Try } from '@shared'
import * as Shared from '@shared'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { type NativeWebDriver, openNativeWebDriver } from './NativeWebDriver'

type Capabilities = Parameters<typeof openNativeWebDriver>[1]

/** openIosWebDriver launches a compatible cached WDA or builds it on the disposable simulator host. */
export async function openIosWebDriver(url: string, device: string, caps: Capabilities): Promise<NativeWebDriver> {
  const cache = await resolveWebDriverAgentCache(device)
  const app = Path.join(cache, 'Build', 'Products', 'Debug-iphonesimulator', 'WebDriverAgentRunner-Runner.app')
  const build = () => openNativeWebDriver(url, { ...caps, 'appium:derivedDataPath': cache })
  if (!await isPrebuiltAgent(app)) {
    IO.progress('Building WebDriverAgent for the selected simulator…')
    return await build()
  }
  IO.progress('Launching cached WebDriverAgent without rebuilding…')
  return await Try(() =>
    openNativeWebDriver(url, {
      ...caps,
      'appium:derivedDataPath': cache,
      'appium:usePrebuiltWDA': true,
      'appium:wdaStartupRetries': 1,
    }), {
    catch(error) {
      if (!String(error).includes('Appium POST ' + url + '/session returned 500:')) {
        Errors.Throw(error)
      }
      IO.warn('Cached WebDriverAgent failed to start. Building WebDriverAgent:', String(error))
      return build()
    },
  })
}

async function resolveWebDriverAgentCache(device: string): Promise<string> {
  const [xcode, sdk, runtime, lock] = await Promise.all([
    Exec.captureStdout('xcrun', ['xcodebuild', '-version'], { timeoutMs: 10_000 }),
    Exec.captureStdout('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-build-version'], { timeoutMs: 10_000 }),
    readSimulatorRuntime(device),
    FS.readFile(Repo.resolvePath('ts/bun.lock'), 'utf8'),
  ])
  const identity = Shared.joinTextLines(Platform.systemInfo().architecture, xcode, sdk, runtime, lock)
  const path = Artifacts.resolvePath('cache', 'native-journeys', 'wda', Platform.hashText(identity))
  await FS.mkdir(path)
  return path
}

const SimulatorListSchema = Schema.object({
  devices: Schema.record(Schema.string(), Schema.array(Schema.object({ udid: Schema.string() }))),
  runtimes: Schema.array(Schema.object({ identifier: Schema.string(), buildversion: Schema.string() })),
})

async function readSimulatorRuntime(device: string): Promise<string> {
  const json = await Exec.captureStdout('xcrun', ['simctl', 'list', '--json'], {
    timeoutMs: 10_000,
  })
  const { devices, runtimes } = Json.Parse(json, { schema: SimulatorListSchema, sourceName: 'simctl booted devices' })
  const identifier = Object.keys(devices).find(key => devices[key]?.some(info => info.udid === device))
  const runtime = runtimes.find(runtime => runtime.identifier === identifier)
  if (!runtime) {
    Errors.ThrowHostEnvironment(`No runtime found for the booted simulator ${device}.`)
  }
  return runtime.identifier + ':' + runtime.buildversion
}

async function isPrebuiltAgent(app: string): Promise<boolean> {
  const files = [
    'Info.plist',
    'WebDriverAgentRunner-Runner',
    'PlugIns/WebDriverAgentRunner.xctest/WebDriverAgentRunner',
  ]
  const present = await Promise.all(files.map(file => FS.exists(Path.join(app, file))))
  return present.every(Boolean)
}
