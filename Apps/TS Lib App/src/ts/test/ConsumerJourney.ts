import { expect } from 'bun:test'
import type { Page } from 'playwright'

/** verifyConsumer exercises compiled Tao views through an ordinary React consumer. */
export async function verifyConsumer(page: Page): Promise<void> {
  page.setDefaultTimeout(5000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const first = page.getByTestId('instance-A')
  const second = page.getByTestId('instance-B')
  const greeting = first.getByTestId('first-greeting')
  await greeting.getByText('Ada', { exact: true }).waitFor()
  await greeting.getByText('Lovelace', { exact: true }).waitFor()
  await page.getByTestId('react-child').waitFor()
  await first.getByText('Published package', { exact: true }).waitFor()
  await first.getByText('Published subfolder', { exact: true }).waitFor()
  await verifyLanguageFeatures(page)
  await verifyValueSnapshots(page)
  await verifyAuthoredState(page)
  await first.getByText('Nested private Tao helper 0', { exact: true }).click()
  await first.getByText('Nested private Tao helper 1', { exact: true }).waitFor()
  await second.getByText('Nested private Tao helper 0', { exact: true }).waitFor()
  await greeting.getByText('Grace', { exact: true }).waitFor()
  await first.getByText('Nested private Tao helper 1', { exact: true }).waitFor()
  await page.getByTestId('unmount').click()
  await first.waitFor({ state: 'detached' })
  await second.getByText('Alan', { exact: true }).waitFor()
  await second.getByText('Turing', { exact: true }).waitFor()
  await second.getByText('Nested private Tao helper 0', { exact: true }).click()
  await second.getByText('Nested private Tao helper 1', { exact: true }).waitFor()
  expect(errors).toEqual([])
}

async function verifyAuthoredState(page: Page): Promise<void> {
  const first = page.getByTestId('state-first')
  const second = page.getByTestId('state-second')
  const firstSaved = first.getByText('Saved state', { exact: true })
  const secondInitial = second.getByText('Second initial state', { exact: true })
  await first.getByText('Ada', { exact: true }).waitFor()
  await secondInitial.waitFor()
  await first.getByRole('button', { name: 'Save state' }).click()
  await firstSaved.waitFor()
  expect(await secondInitial.isVisible()).toBe(true)
  await page.getByTestId('update').click()
  await page.getByText('Aliased capture: Grace', { exact: true }).waitFor()
  expect(await firstSaved.isVisible()).toBe(true)
  await first.getByRole('button', { name: 'Read current input' }).click()
  await first.getByText('Grace', { exact: true }).waitFor()
  expect(await firstSaved.isVisible()).toBe(false)
  expect(await secondInitial.isVisible()).toBe(true)
  await second.getByRole('button', { name: 'Save state' }).click()
  await second.getByText('Saved state', { exact: true }).waitFor()
  expect(await first.getByText('Grace', { exact: true }).isVisible()).toBe(true)
}

async function verifyLanguageFeatures(page: Page): Promise<void> {
  const features = page.getByTestId('language-features')
  for (
    const text of [
      'File-scoped text',
      'Folder-scoped view',
      'Package-scoped view',
      'Project-scoped view',
      'Package import',
      'Tao alias',
      'Aliased package import',
      'Nested lexical text',
      'Aliased capture: Ada',
      'Foreign view: Ada',
      'Escaped "text", backslash \\ and Unicode ☺',
    ]
  ) {
    await features.getByText(text, { exact: true }).waitFor()
  }
  const input = features.getByRole('textbox')
  await input.fill('Edited library input')
  expect(await input.inputValue()).toBe('Edited library input')
}

async function verifyValueSnapshots(page: Page): Promise<void> {
  await page.getByText('A, A, B', { exact: true }).waitFor()
  await page.getByTestId('recompute-equal').click()
  await page.getByText('Reused snapshot', { exact: true }).waitFor()
  await page.getByTestId('reorder-rows').click()
  await page.getByText('B, A, A', { exact: true }).waitFor()
  await page.getByTestId('add-duplicate-row').click()
  await page.getByText('B, A, A, A', { exact: true }).waitFor()
}
