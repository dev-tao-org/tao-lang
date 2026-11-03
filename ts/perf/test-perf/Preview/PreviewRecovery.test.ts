import * as Tests from '@shared-tests'

import type { HeadlessBrowser } from '@shared/os'
import { type RecoveryFixture, withRecoveryPreview } from './PreviewRecovery.test-fixtures'

Tests.test(
  'dual previews retain render errors for manual recovery and accept corrected commits from fresh instances',
  async () => {
    await withRecoveryPreview(verifyRecoveryJourney)
  },
  60_000,
)

async function verifyRecoveryJourney({ page, change }: RecoveryFixture): Promise<void> {
  await expectLabels(page, 'Ready')
  const initialBoots = await readBoots(page)
  await change('Broken')
  for (const id of ['left', 'right']) {
    await page.frameLocator(`#${id}`).locator('#tao-preview-error').waitFor()
    Tests.expect(await page.frameLocator(`#${id}`).locator('#tao-preview-error').textContent())
      .toContain('Deliberate preview render failure')
    await page.frameLocator(`#${id}`).getByRole('button', { name: 'Reload', exact: true }).waitFor()
  }
  await page.clock.fastForward(1200)
  Tests.expect(await readBoots(page)).toEqual(initialBoots)
  await change('Repaired')
  await expectLabels(page, 'Repaired')
  Tests.expect(await readBoots(page)).toEqual(initialBoots)
  await verifyManualReloadAndRetiredMessages(page, initialBoots.left!)
}

async function verifyManualReloadAndRetiredMessages(page: HeadlessBrowser.Page, retiredBoot: string): Promise<void> {
  const oldFrame = page.frameLocator('#left')
  await oldFrame.locator('body').evaluate(body => {
    body.ownerDocument.defaultView!.dispatchEvent(new ErrorEvent('error', { message: 'Manual recovery probe' }))
  })
  await page.locator('aside:visible').filter({ hasText: 'Manual recovery probe' })
    .getByRole('button', { name: 'Reload', exact: true }).click()
  await expectLabels(page, 'Repaired')
  const boots = await readBoots(page)
  Tests.expect(boots.left).not.toBe(retiredBoot)
  await observeRetiredMessage(page)
  await page.frameLocator('#left').locator('body').evaluate((body, oldBoot) => {
    const host = body.ownerDocument.defaultView!
    const query = new URLSearchParams(host.location.search)
    host.parent.postMessage({
      type: 'tao.preview-error',
      sessionId: query.get('sessionId'),
      frameId: 'left',
      bootId: oldBoot,
      message: 'Retired instance must be ignored',
      kind: 'runtime-error',
    }, query.get('parentOrigin')!)
  }, retiredBoot)
  await page.locator('body[data-retired-message-received="true"]').waitFor()
  Tests.expect(await page.locator('aside:visible').count()).toBe(0)
  Tests.expect(await readBoots(page)).toEqual(boots)
}

async function observeRetiredMessage(page: HeadlessBrowser.Page): Promise<void> {
  await page.locator('body').evaluate(body => {
    const receive = (event: MessageEvent) => {
      if (event.data?.message !== 'Retired instance must be ignored') {
        return
      }
      body.dataset.retiredMessageReceived = 'true'
      body.ownerDocument.defaultView!.removeEventListener('message', receive)
    }
    body.ownerDocument.defaultView!.addEventListener('message', receive)
  })
}

async function expectLabels(page: HeadlessBrowser.Page, label: string): Promise<void> {
  for (const [index, id] of ['left', 'right'].entries()) {
    const locator = page.frameLocator(`#${id}`).getByTestId('recovery-label')
    await locator.filter({ hasText: label }).waitFor()
    Tests.expect(await locator.textContent()).toBe(label)
    await page.locator('aside').nth(index).waitFor({ state: 'hidden' })
  }
}

async function readBoots(page: HeadlessBrowser.Page): Promise<Record<string, string>> {
  return await page.locator('iframe').evaluateAll(frames =>
    Object.fromEntries(frames.map(frame => [
      frame.id,
      new URL((frame as HTMLIFrameElement).src).searchParams.get('bootId')!,
    ]))
  )
}
