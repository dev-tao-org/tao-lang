import { Json } from '@shared'
import { Errors, Time, Try } from '@shared'
import type { Browser, Page } from '../bridges/Bridge_playwright'
import Env from '../Env'
import Exec from '../Exec'
import * as Platform from '../Platform'

export type { Browser, FrameLocator, Page } from '../bridges/Bridge_playwright'

/** HeadlessBrowserSession is the Playwright browser handle owned by one headless operation. */
export type HeadlessBrowserSession = Browser

/** TestBrowser provides isolated headless UI operations for app journeys. */
export type TestBrowser = {
  open(url: string): Promise<void>
  press(tag: string): Promise<void>
  type(tag: string, value: string): Promise<void>
  expectText(value: string, tag?: string): Promise<void>
  expectInput(tag: string, value: string): Promise<void>
  dispose(): Promise<void>
}

/** launch starts isolated headless Chrome after checking host access. */
export async function launch(
  operation: string,
  options: { handleSignals?: boolean } = {},
): Promise<HeadlessBrowserSession> {
  if (Platform.systemInfo().os === 'Darwin') {
    await Exec.requireHostProcessAccess(`Run ./agent unsandboxed ${operation}; Chrome was not launched.`)
  }
  const { chromium } = await import('../bridges/Bridge_playwright')
  return await chromium.launch({
    headless: true,
    channel: Env.get('TAO_PREVIEW_BROWSER_CHANNEL') ?? 'chrome',
    handleSIGINT: options.handleSignals,
    handleSIGTERM: options.handleSignals,
    handleSIGHUP: options.handleSignals,
  })
}

const InitialNavigationTimeoutMs = 30_000
/** openPage waits for initial document loading separately from short interaction deadlines. */
export async function openPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { timeout: InitialNavigationTimeoutMs })
}

/** openTestBrowser adapts the existing browser toolchain to isolated headless app journeys. */
export async function openTestBrowser(): Promise<TestBrowser> {
  const browser = await launch('test <file.tao>', { handleSignals: false })
  return await Try(async (): Promise<TestBrowser> => {
    const page = await browser.newPage({ viewport: { width: 768, height: 1024 } })
    page.setDefaultTimeout(5000)
    return {
      async open(url) {
        await openPage(page, url)
      },
      async press(tag) {
        await page.getByTestId(tag).click()
      },
      async type(tag, value) {
        await input(page, tag).fill(value)
      },
      async expectText(value, tag) {
        const scope = tag ? page.getByTestId(tag) : page
        await scope.getByText(value, { exact: true }).first().waitFor({ state: 'visible' })
      },
      expectInput: (tag, value) => expectInput(page, tag, value),
      dispose: () => browser.close(),
    }
  }, {
    async catch(error) {
      await browser.close()
      Errors.Throw(error)
    },
  })
}

type ObservedInputValue = string | undefined

function input(page: Page, tag: string) {
  const root = page.getByTestId(tag)
  return page.locator('input, textarea').and(root).or(root.locator('input, textarea'))
}

async function expectInput(page: Page, tag: string, value: string): Promise<void> {
  const deadline = Time.nowMs() + 5000
  let actual: ObservedInputValue
  while (Time.nowMs() < deadline) {
    actual = await input(page, tag).inputValue({ timeout: Math.max(1, deadline - Time.nowMs()) })
    if (actual === value) {
      return
    }
    await Time.sleep(Math.min(25, Math.max(0, deadline - Time.nowMs())))
  }
  Errors.ThrowUserInput(`Expected #${tag} input value ${Json.Print(value)}, received ${Json.Print(actual)}.`)
}
