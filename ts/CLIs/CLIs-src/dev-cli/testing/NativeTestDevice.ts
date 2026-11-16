import { Errors, Json, Time, Try } from '@shared'
import { Artifacts, FS, Platform } from '@shared/os'
import { Http } from '@shared/web'
import type * as Workspace from '@workspace'
import { type NativeWebDriver, waitForNativeObservation } from './NativeWebDriver'

/** NativeTestPlatform identifies the native React Native platforms used for journeys. */
export type NativeTestPlatform = 'ios' | 'android'

/** createNativeTestTarget adapts an owned native WebDriver session to the Tao journey runner. */
export function createNativeTestTarget(
  platform: NativeTestPlatform,
  driver: NativeWebDriver,
  clearAppData?: () => Promise<void>,
): Workspace.AppTestTarget {
  return {
    platform,
    async openDevice() {
      let opening = false
      function takeOpeningTimeout() {
        // The first UI observation includes the device's cold Metro bundle request.
        const timeout = opening ? 90_000 : undefined
        opening = false
        return timeout
      }
      return {
        async open(url) {
          await openExpoGo(platform, driver, url, clearAppData)
          opening = true
        },
        async press(tag) {
          const element = await waitForElement(driver, tagSelector(platform, tag), `#${tag}`, takeOpeningTimeout())
          await driver.tap(element)
        },
        type: (tag, value) => typeInput(platform, driver, tag, value, takeOpeningTimeout()),
        expectText: (value, tag) => expectText(platform, driver, value, tag, takeOpeningTimeout()),
        expectInput: (tag, value) => expectInput(platform, driver, tag, value, takeOpeningTimeout()),
        dispose: () => disposeDevice(platform, driver),
      }
    },
  }
}

async function disposeDevice(platform: NativeTestPlatform, driver: NativeWebDriver): Promise<void> {
  const path = Artifacts.resolvePath('logs', 'native-journeys', `${platform}-ui-${Platform.randomUUID()}.xml`)
  await Try(async () => FS.writeFile(path, await driver.snapshot()), {
    async finally() {
      await driver.execute('mobile: terminateApp', applicationArguments(platform))
    },
  })
}

/** expoGoApplicationId returns Expo Go's package identifier for the selected platform. */
export function expoGoApplicationId(platform: NativeTestPlatform): string {
  return platform === 'ios' ? 'host.exp.Exponent' : 'host.exp.exponent'
}

type TaggedScope = string | undefined
type NativeApplicationArguments = { bundleId: string } | { appId: string }

async function openExpoGo(
  platform: NativeTestPlatform,
  driver: NativeWebDriver,
  url: string,
  clearAppData?: () => Promise<void>,
): Promise<void> {
  const port = Http.url(url).port
  const address = platform === 'ios' ? '127.0.0.1' : '10.0.2.2'
  const link = `exp://${address}:${port}`
  await driver.execute('mobile: terminateApp', applicationArguments(platform))
  await clearAppData?.()
  const bundleId = expoGoApplicationId(platform)
  const argumentsForPlatform = platform === 'ios' ? { url: link, bundleId } : { url: link, package: bundleId }
  await driver.execute('mobile: deepLink', argumentsForPlatform)
}

function applicationArguments(platform: NativeTestPlatform): NativeApplicationArguments {
  const appId = expoGoApplicationId(platform)
  return platform === 'ios' ? { bundleId: appId } : { appId }
}

async function typeInput(
  platform: NativeTestPlatform,
  driver: NativeWebDriver,
  tag: string,
  value: string,
  timeoutMs?: number,
): Promise<void> {
  const element = await waitForElement(driver, inputSelector(platform, tag), `input #${tag}`, timeoutMs)
  await driver.tap(element)
  // A disabled field can refuse keyboard focus. Attempt an actual touch before observing that state.
  if (await awaitKeyboard(driver)) {
    await driver.enterText(element, value)
    await hideKeyboard(platform, driver)
  }
}

async function awaitKeyboard(driver: NativeWebDriver): Promise<boolean> {
  const deadline = Time.nowMs() + 1500
  while (Time.nowMs() < deadline) {
    if (await driver.isKeyboardShown()) {
      return true
    }
    await Time.sleep(100)
  }
  return false
}

async function hideKeyboard(platform: NativeTestPlatform, driver: NativeWebDriver): Promise<void> {
  if (platform === 'android') {
    await driver.execute('mobile: pressKey', { keycode: 4 })
  }
}

async function expectInput(
  platform: NativeTestPlatform,
  driver: NativeWebDriver,
  tag: string,
  value: string,
  timeoutMs?: number,
): Promise<void> {
  const selector = inputSelector(platform, tag)
  const attribute = platform === 'ios' ? 'value' : 'text'
  const description = `input #${tag} with value ${Json.Print(value)}`
  await waitForNativeObservation(description, async () => {
    const element = await findJourneyElement(driver, selector)
    if (element && await driver.attribute(element, attribute) === value) {
      return element
    }
    return undefined
  }, timeoutMs)
}

async function expectText(
  platform: NativeTestPlatform,
  driver: NativeWebDriver,
  value: string,
  tag: TaggedScope,
  timeoutMs?: number,
): Promise<void> {
  const literal = xpathLiteral(value)
  const attributes = platform === 'ios' ? ['label', 'value'] : ['text', 'content-desc']
  const condition = attributes.map(name => `@${name}=${literal}`).join(' or ')
  const description = tag ? `exact text ${Json.Print(value)} in #${tag}` : `exact text ${Json.Print(value)}`
  await waitForElement(driver, withinTag(platform, tag, condition), description, timeoutMs)
}

function waitForElement(
  driver: NativeWebDriver,
  selector: string,
  description: string,
  timeoutMs = 30_000,
): Promise<string> {
  return waitForNativeObservation(description, () => findJourneyElement(driver, selector), timeoutMs)
}

async function findJourneyElement(driver: NativeWebDriver, selector: string): Promise<string | undefined> {
  const element = await findVisibleElement(driver, selector)
  if (element === undefined) {
    await dismissExpoGoMenu(driver)
  }
  return element
}

// The Expo Go panel exposes this heading even when Android's onboarding replaces the menu items.
const ExpoGoMenuHeading = "//*[starts-with(@text,'SDK version: ') or starts-with(@label,'SDK version: ')]"
async function dismissExpoGoMenu(driver: NativeWebDriver): Promise<void> {
  const sdk = await findVisibleElement(driver, ExpoGoMenuHeading)
  if (sdk === undefined) {
    return
  }
  const onboarding = await findVisibleElement(driver, expoTextSelector('Continue'))
  const close = onboarding ?? await findVisibleElement(driver, expoTextSelector('Close'))
  if (close !== undefined) {
    await driver.tap(close)
  }
}

function expoTextSelector(label: string): string {
  const text = xpathLiteral(label)
  return `//*[@text=${text} or @label=${text} or @content-desc=${text}]`
}

async function findVisibleElement(driver: NativeWebDriver, selector: string): Promise<string | undefined> {
  for (const element of await driver.find(selector)) {
    if (await driver.isDisplayed(element)) {
      return element
    }
  }
  return undefined
}

function inputSelector(platform: NativeTestPlatform, tag: string): string {
  const inputClasses = platform === 'ios'
    ? ['XCUIElementTypeTextField', 'XCUIElementTypeTextView', 'XCUIElementTypeSecureTextField']
    : ['android.widget.EditText']
  const condition = inputClasses.map(type => `name()=${xpathLiteral(type)}`).join(' or ')
  return withinTag(platform, tag, condition)
}

function withinTag(platform: NativeTestPlatform, tag: TaggedScope, condition: string): string {
  const match = `*[${condition}]`
  if (tag === undefined) {
    return '//' + match
  }
  const scope = tagSelector(platform, tag)
  return `${scope}[${condition}] | ${scope}//${match}`
}

function tagSelector(platform: NativeTestPlatform, tag: string): string {
  const attribute = platform === 'ios' ? 'name' : 'resource-id'
  return `//*[@${attribute}=${xpathLiteral(tag)}]`
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return "'" + value + "'"
  }
  if (!value.includes('"')) {
    return '"' + value + '"'
  }
  const segments = value.split("'").map(segment => "'" + segment + "'")
  if (segments.length === 1) {
    Errors.ThrowShouldNeverHappen('Expected an apostrophe in the XPath value.')
  }
  return 'concat(' + segments.join(`, "'", `) + ')'
}
