import * as Tests from '@shared-tests'

import type { HeadlessBrowser } from '@shared/os'
import { type RecoveryFixture, withRecoveryPreview } from './Preview.test-fixtures.Recovery'

Tests.test(
  'dual previews retain render errors and follow saves after recovering or reopening',
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
  await verifyReopenWithConcurrentSave(page, change)
  await verifyReopenRetainsBuildError(page, change)
  await verifyOpeningCanBeClosed(page)
}

async function verifyOpeningCanBeClosed(page: HeadlessBrowser.Page): Promise<void> {
  await page.getByRole('button', { name: 'Close previews' }).click()
  await page.route(
    url => url.searchParams.has('frameId'),
    route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>Waiting for preview.</p>' }),
    { times: 2 },
  )
  await page.getByRole('button', { name: 'Show previews' }).click()
  for (const id of ['left', 'right']) {
    await page.frameLocator(`#${id}`).getByText('Waiting for preview.').waitFor()
  }
  await page.locator('body[data-status="opening"]').waitFor()
  await page.getByRole('button', { name: 'Close previews' }).click()
  await page.locator('body[data-status="closed"]').waitFor()
  Tests.expect(await page.locator('iframe[src]').count()).toBe(0)
  await page.getByRole('button', { name: 'Show previews' }).click()
  await page.locator('body[data-status="ready"]').waitFor()
}

async function verifyReopenRetainsBuildError(page: HeadlessBrowser.Page, change: RecoveryFixture['change']) {
  await page.getByRole('button', { name: 'Close previews' }).click()
  await Tests.expect(change('Invalid')).rejects.toThrow('failed')
  await page.locator('body[data-received-outcome*="build-error"]').waitFor()
  await page.getByRole('button', { name: 'Show previews' }).click()
  for (const [index, id] of ['left', 'right'].entries()) {
    await page.frameLocator(`#${id}`).getByTestId('recovery-label').filter({ hasText: 'Ready' }).waitFor()
    await page.locator('aside').nth(index).filter({ hasText: 'Deliberate preview build failure' }).waitFor()
  }
}

async function verifyReopenWithConcurrentSave(page: HeadlessBrowser.Page, change: RecoveryFixture['change']) {
  const previousBaseline = await page.locator('body').getAttribute('data-received-baseline')
  await page.getByRole('button', { name: 'Close previews' }).click()
  await page.locator('body[data-status="closed"]').waitFor()
  await page.route('**/open-preview', async route => {
    const response = await route.fetch()
    const revision = await change('Ready')
    await page.locator(`body[data-received-baseline*="${revision}"]`).waitFor()
    await route.fulfill({ response })
  }, { times: 1 })
  await page.getByRole('button', { name: 'Show previews' }).click()
  await page.locator('body[data-status="ready"]').waitFor()
  await expectLabels(page, 'Ready')
  const boots = await readBoots(page)
  await page.clock.fastForward(1200)
  Tests.expect(await readBoots(page)).toEqual(boots)
  await expectLabels(page, 'Ready')
  await verifyReloadWithStaleBaseline(page, previousBaseline!)
}

async function verifyReloadWithStaleBaseline(page: HeadlessBrowser.Page, baseline: string): Promise<void> {
  await page.evaluate(
    data => document.dispatchEvent(new CustomEvent('fixture:replay-baseline', { detail: data })),
    baseline,
  )
  const retiredBoot = (await readBoots(page)).left!
  await reloadPreviewAfterError(page, 'Stale baseline probe')
  await page.locator(`#left[src]:not([src*="${retiredBoot}"])`).waitFor()
  await expectLabels(page, 'Ready')
}

async function verifyManualReloadAndRetiredMessages(page: HeadlessBrowser.Page, retiredBoot: string): Promise<void> {
  await reloadPreviewAfterError(page, 'Manual recovery probe')
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

async function reloadPreviewAfterError(page: HeadlessBrowser.Page, message: string): Promise<void> {
  await page.frameLocator('#left').locator('body').evaluate((body, text) => {
    body.ownerDocument.defaultView!.dispatchEvent(new ErrorEvent('error', { message: text }))
  }, message)
  await page.locator('aside:visible').filter({ hasText: message })
    .getByRole('button', { name: 'Reload', exact: true }).click()
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
