import { expect } from 'bun:test'
import type { Page } from 'playwright'

/** verifyDisabledPreview checks actual browser input, presses and a live boolean prop. */
export async function verifyDisabledPreview(page: Page): Promise<void> {
  const tao = page.getByRole('button', { name: 'Tao presses: 0' })
  const raw = page.getByRole('button', { name: 'Raw presses: 0' })
  const input = page.getByTestId('previewInput')
  const lock = page.getByRole('button', { name: 'Lock preview' })
  await input.fill('Before locking')
  await lock.click()
  await page.getByText('Programmatic: 1', { exact: true }).waitFor()

  expect(await tao.isDisabled()).toBe(true)
  expect(await raw.isDisabled()).toBe(true)
  expect(await input.isDisabled()).toBe(true)
  await tao.click({ force: true })
  await tao.tap({ force: true })
  await raw.click({ force: true })
  await tao.press('Enter')
  await tao.press('Space')
  await raw.press('Enter')
  await input.click({ force: true })
  await page.keyboard.type('Must not change')
  await tao.waitFor()
  await raw.waitFor()
  expect(await input.inputValue()).toBe('Before locking')

  await page.getByRole('button', { name: 'Unlock preview' }).click()
  await tao.press('Enter')
  await page.getByRole('button', { name: 'Tao presses: 1' }).click()
  await page.getByRole('button', { name: 'Tao presses: 2' }).tap()
  await page.getByRole('button', { name: 'Tao presses: 3' }).waitFor()
  await raw.press('Space')
  await page.getByRole('button', { name: 'Raw presses: 1' }).waitFor()
  await input.fill('After unlocking')
  expect(await input.inputValue()).toBe('After unlocking')
  await page.getByText('Programmatic: 1', { exact: true }).waitFor()
}
