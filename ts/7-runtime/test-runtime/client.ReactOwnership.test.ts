import * as Runtime from '@runtime'
import { Time, Try, UserInput } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, HeadlessBrowser, Platform, Repo } from '@shared/os'
import { createReactOwnershipApp } from './client.test-fixtures.ReactOwnership'

Tests.test(
  'Tao hook state and expression subscriptions follow committed React ownership through Metro refresh',
  async () => {
    const root = Artifacts.resolvePath('tmp', `react-ownership-${Platform.randomUUID()}`)
    let browser: OptionalBrowser
    let expo: OptionalExpoSession
    await Try(async () => {
      const application = await Runtime.create({
        directory: root,
        dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules'),
      })
      await FS.writeFile(application.appPath, createReactOwnershipApp(2, false))
      expo = await Runtime.start(application)
      browser = await HeadlessBrowser.launch('test <file.tao>')
      await verifyOwnershipJourney(browser, expo)
    }, {
      async catch(error) {
        UserInput.fail(`React ownership Metro acceptance failed. ${String(error)}`)
      },
      async finally() {
        await closeBrowser(browser)
        await stopExpo(expo)
        await FS.rm(root, { recursive: true, force: true })
      },
    })
  },
  60_000,
)

async function verifyOwnershipJourney(
  browser: HeadlessBrowser.HeadlessBrowserSession,
  expo: Runtime.ExpoSession,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } })
  const pageErrors: string[] = []
  page.setDefaultTimeout(5000)
  page.on('pageerror', error => pageErrors.push(error.message))
  await HeadlessBrowser.openPage(page, expo.url)
  await expectValue(page, 'count-A', '1')
  await expectValue(page, 'count-B', '10')
  await expectValue(page, 'scaled-A', '2')
  await expectValue(page, 'object-value', '0')
  await expectValue(page, 'race-value', '1')
  await expectValue(page, 'retained-value', '0')
  await expectValue(page, 'suspended-fallback', 'suspended')
  await verifyAbandonedAndUnmountedOwnership(page)
  await changeFactorAndPreserveState(page, expo)
  await changeTopologyAndRemoveOneCounter(page, expo)
  Tests.expect(pageErrors).toEqual([])
}

async function verifyAbandonedAndUnmountedOwnership(page: HeadlessBrowser.Page): Promise<void> {
  const abandonedBefore = await valueOf(page, 'abandoned-evaluations')
  await page.getByTestId('advance-abandoned-source').click()
  await expectValue(page, 'abandoned-evaluations', abandonedBefore)

  await page.getByTestId('unmount-retained').click()
  await expectMissing(page, 'retained-value')
  const retainedBefore = await valueOf(page, 'retained-evaluations')
  await page.getByTestId('advance-retained-source').click()
  await expectValue(page, 'retained-evaluations', retainedBefore)

  await page.getByTestId('advance-object-source').click()
  await expectValue(page, 'object-value', '1')
}

async function changeFactorAndPreserveState(page: HeadlessBrowser.Page, expo: Runtime.ExpoSession): Promise<void> {
  await page.getByTestId('increment-A').click()
  await expectValue(page, 'count-A', '2')
  await publishOwnership(expo, 2, false)
  await expectValue(page, 'count-A', '2')
  await expectValue(page, 'count-B', '10')
  await expectValue(page, 'scaled-A', '6')
  await expectValue(page, 'scaled-B', '30')
}

async function changeTopologyAndRemoveOneCounter(page: HeadlessBrowser.Page, expo: Runtime.ExpoSession): Promise<void> {
  await publishOwnership(expo, 3, true)
  await expectValue(page, 'marker-A', 'topology-2')
  await expectCounterScale(page, 'A', 3)
  const beforeIncrement = Number(await valueOf(page, 'count-B'))
  await page.getByTestId('increment-B').click()
  await expectValue(page, 'count-B', String(beforeIncrement + 1))
  await expectValue(page, 'scaled-B', String((beforeIncrement + 1) * 3))
  await page.getByTestId('remove-A').click()
  await expectMissing(page, 'count-A')
  await expectValue(page, 'count-B', String(beforeIncrement + 1))
  await expectValue(page, 'scaled-B', String((beforeIncrement + 1) * 3))
}

async function publishOwnership(expo: Runtime.ExpoSession, sequence: number, topology: boolean): Promise<void> {
  const outcome = await expo.publish({
    revision: `ownership-${sequence}`,
    sequence,
    files: { 'App.tsx': createReactOwnershipApp(3, topology) },
  })
  Tests.expect(outcome.status).toBe('published')
}

async function expectCounterScale(page: HeadlessBrowser.Page, id: string, factor: number): Promise<void> {
  const count = Number(await valueOf(page, `count-${id}`))
  await expectValue(page, `scaled-${id}`, String(count * factor))
}

async function expectValue(page: HeadlessBrowser.Page, testID: string, expected: string): Promise<void> {
  const deadline = Time.nowMs() + 10_000
  let actual: OptionalObservedText = null
  while (Time.nowMs() < deadline) {
    const locator = page.getByTestId(testID)
    if (await locator.count() > 0) {
      actual = await locator.textContent()
      if (actual === expected) {
        return
      }
    }
    await Time.sleep(50)
  }
  Tests.expect(actual).toBe(expected)
}

async function expectMissing(page: HeadlessBrowser.Page, testID: string): Promise<void> {
  const deadline = Time.nowMs() + 10_000
  while (Time.nowMs() < deadline) {
    if (await page.getByTestId(testID).count() === 0) {
      return
    }
    await Time.sleep(50)
  }
  Tests.expect(await page.getByTestId(testID).count()).toBe(0)
}

async function valueOf(page: HeadlessBrowser.Page, testID: string): Promise<string> {
  return await page.getByTestId(testID).textContent() ?? ''
}

async function closeBrowser(browser: OptionalBrowser): Promise<void> {
  await Try(async () => await browser?.close(), { catch: () => undefined })
}

async function stopExpo(expo: OptionalExpoSession): Promise<void> {
  await Try(async () => await expo?.dispose(), { catch: () => undefined })
}

type OptionalBrowser = HeadlessBrowser.HeadlessBrowserSession | undefined
type OptionalExpoSession = Runtime.ExpoSession | undefined
type OptionalObservedText = string | null
