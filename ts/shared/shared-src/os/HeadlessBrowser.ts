import { Errors, Time, Try } from '@shared'
import type { Browser, Page } from './bridges/Bridge_playwright'
import * as Env from './Env'
import * as Platform from './Platform'

export type { Browser, FrameLocator, Page } from './bridges/Bridge_playwright'

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
export async function launch(operation: string, options: { handleSignals?: boolean } = {}): Promise<Browser> {
  if (Platform.systemInfo().os === 'Darwin') {
    await Platform.requireHostProcessAccess(`Run ./agent unsandboxed ${operation}; Chrome was not launched.`)
  }
  const { chromium } = await import('./bridges/Bridge_playwright')
  return await chromium.launch({
    headless: true,
    channel: Env.get('TAO_PREVIEW_BROWSER_CHANNEL') ?? 'chrome',
    handleSIGINT: options.handleSignals,
    handleSIGTERM: options.handleSignals,
    handleSIGHUP: options.handleSignals,
  })
}

/** openTestBrowser adapts the existing browser toolchain to isolated headless app journeys. */
export async function openTestBrowser(): Promise<TestBrowser> {
  const browser = await launch('test <file.tao>', { handleSignals: false })
  return await Try(async (): Promise<TestBrowser> => {
    const page = await browser.newPage({ viewport: { width: 768, height: 1024 } })
    page.setDefaultTimeout(5000)
    return {
      async open(url) {
        await page.goto(url)
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

function input(page: Page, tag: string) {
  const root = page.getByTestId(tag)
  return page.locator('input, textarea').and(root).or(root.locator('input, textarea'))
}

async function expectInput(page: Page, tag: string, value: string): Promise<void> {
  const deadline = Time.nowMs() + 5000
  let actual: string | undefined
  while (Time.nowMs() < deadline) {
    actual = await input(page, tag).inputValue({ timeout: Math.max(1, deadline - Time.nowMs()) })
    if (actual === value) {
      return
    }
    await Time.sleep(Math.min(25, Math.max(0, deadline - Time.nowMs())))
  }
  Errors.ThrowUserInput(`Expected #${tag} input value ${JSON.stringify(value)}, received ${JSON.stringify(actual)}.`)
}
