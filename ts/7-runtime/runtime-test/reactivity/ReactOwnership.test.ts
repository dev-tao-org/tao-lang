import * as Runtime from '@runtime/Runtime'
import { Errors, Time, Try } from '@shared'
import { Artifacts, FileSystem, HeadlessBrowser, Platform, Repo, Tests } from '@shared/os'
import { createReactOwnershipApp } from './ReactOwnershipFixture'

Tests.test(
  'Tao hook state and expression subscriptions follow committed React ownership through Metro refresh',
  async () => {
    const root = Artifacts.resolvePath('tmp', `react-ownership-${Platform.randomUUID()}`)
    let browser: Awaited<ReturnType<typeof HeadlessBrowser.launch>> | undefined
    let expo: Runtime.ExpoSession | undefined
    await Try(async () => {
      const application = await Runtime.create({
        directory: root,
        dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules'),
      })
      await FileSystem.writeFile(application.appPath, createReactOwnershipApp(2, false))
      expo = await Runtime.start(application)
      browser = await HeadlessBrowser.launch('test <file.tao>')
      await verifyOwnershipJourney(browser, expo.url, application.appPath)
    }, {
      async catch(error) {
        Errors.ThrowUserInput(`React ownership Metro acceptance failed. ${String(error)}`)
      },
      async finally() {
        await closeBrowser(browser)
        await stopExpo(expo)
        await FileSystem.rm(root, { recursive: true, force: true })
      },
    })
  },
  60_000,
)

async function verifyOwnershipJourney(
  browser: Awaited<ReturnType<typeof HeadlessBrowser.launch>>,
  expoUrl: string,
  appPath: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 768, height: 1024 } })
  const pageErrors: string[] = []
  page.setDefaultTimeout(5000)
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(expoUrl)
  await expectValue(page, 'count-A', '1')
  await expectValue(page, 'count-B', '10')
  await expectValue(page, 'scaled-A', '2')
  await expectValue(page, 'object-value', '0')
  await expectValue(page, 'race-value', '1')
  await expectValue(page, 'retained-value', '0')
  await expectValue(page, 'suspended-fallback', 'suspended')
  await verifyAbandonedAndUnmountedOwnership(page)
  await changeFactorAndPreserveState(page, appPath)
  await changeTopologyAndRemoveOneCounter(page, appPath)
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

async function changeFactorAndPreserveState(page: HeadlessBrowser.Page, appPath: string): Promise<void> {
  await page.getByTestId('increment-A').click()
  await expectValue(page, 'count-A', '2')
  await FileSystem.writeFile(appPath, createReactOwnershipApp(3, false))
  await expectValue(page, 'count-A', '2')
  await expectValue(page, 'count-B', '10')
  await expectValue(page, 'scaled-A', '6')
  await expectValue(page, 'scaled-B', '30')
}

async function changeTopologyAndRemoveOneCounter(page: HeadlessBrowser.Page, appPath: string): Promise<void> {
  await FileSystem.writeFile(appPath, createReactOwnershipApp(3, true))
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

async function expectCounterScale(page: HeadlessBrowser.Page, id: string, factor: number): Promise<void> {
  const count = Number(await valueOf(page, `count-${id}`))
  await expectValue(page, `scaled-${id}`, String(count * factor))
}

async function expectValue(page: HeadlessBrowser.Page, testID: string, expected: string): Promise<void> {
  const deadline = Time.nowMs() + 10_000
  let actual: string | null = null
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

async function closeBrowser(browser: Awaited<ReturnType<typeof HeadlessBrowser.launch>> | undefined): Promise<void> {
  await Try(async () => await browser?.close(), { catch: () => undefined })
}

async function stopExpo(expo: Runtime.ExpoSession | undefined): Promise<void> {
  await Try(async () => await expo?.dispose(), { catch: () => undefined })
}
