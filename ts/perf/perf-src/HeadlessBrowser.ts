import { Errors, Time, Try } from '@shared'
import { Env, Platform } from '@shared/os'
import type { TestBrowser } from '@workspace/testing/AppTests'
import { chromium, type Page } from 'playwright'

/** openTestBrowser adapts the existing browser toolchain to isolated headless app journeys. */
export async function openTestBrowser(): Promise<TestBrowser> {
  if (Platform.systemInfo().os === 'Darwin') {
    await Platform.requireHostProcessAccess('Run ./agent unsandboxed test <file.tao>; Chrome was not launched.')
  }
  const browser = await chromium.launch({
    headless: true,
    channel: Env.get('TAO_PREVIEW_BROWSER_CHANNEL') ?? 'chrome',
  })
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
