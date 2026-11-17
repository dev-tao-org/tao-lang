import { expect } from 'bun:test'
import type { Page } from 'playwright'

/** verifyConsumer exercises compiled Tao views through an ordinary React consumer. */
export async function verifyConsumer(page: Page): Promise<void> {
  page.setDefaultTimeout(5000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const first = page.getByTestId('instance-A')
  const second = page.getByTestId('instance-B')
  await first.getByText('Ada', { exact: true }).waitFor()
  await first.getByText('Lovelace', { exact: true }).waitFor()
  await page.getByTestId('react-child').waitFor()
  await first.getByText('Published package', { exact: true }).waitFor()
  await first.getByText('Published subfolder', { exact: true }).waitFor()
  await verifyLanguageFeatures(page)
  await verifyValueSnapshots(page)
  await first.getByText('Nested private Tao helper 0', { exact: true }).click()
  await first.getByText('Nested private Tao helper 1', { exact: true }).waitFor()
  await second.getByText('Nested private Tao helper 0', { exact: true }).waitFor()
  await page.getByTestId('update').click()
  await first.getByText('Grace', { exact: true }).waitFor()
  await first.getByText('Nested private Tao helper 1', { exact: true }).waitFor()
  await page.getByTestId('unmount').click()
  await first.waitFor({ state: 'detached' })
  await second.getByText('Alan', { exact: true }).waitFor()
  await second.getByText('Turing', { exact: true }).waitFor()
  await second.getByText('Nested private Tao helper 0', { exact: true }).click()
  await second.getByText('Nested private Tao helper 1', { exact: true }).waitFor()
  expect(errors).toEqual([])
}

async function verifyLanguageFeatures(page: Page): Promise<void> {
  const features = page.getByTestId('language-features')
  for (
    const text of [
      'File-scoped text',
      'Folder-scoped view',
      'Package-scoped view',
      'Package import',
      'Tao alias',
      'Aliased package import',
      'Tao import from a package subfolder',
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
