import { Errors } from '@shared'
import * as Tests from '@shared-tests'
import { createNativeTestTarget } from '../../CLIs-src/dev-cli/testing/NativeTestDevice'
import type { NativeWebDriver } from '../../CLIs-src/dev-cli/testing/NativeWebDriver'

Tests.test('Android text entry touches both fields and types only into the focused editable field', async () => {
  const actions: string[] = []
  let disabled = false
  const driver: NativeWebDriver = {
    execute: async script => Errors.ThrowShouldNeverHappen(`Unexpected Appium script ${script}.`),
    find: async () => ['input'],
    attribute: async (_element, name) => name === 'focused' ? 'true' : String(!disabled),
    isDisplayed: async () => true,
    isKeyboardShown: async () => Errors.ThrowShouldNeverHappen('The Android test IME has no visible keyboard.'),
    snapshot: async () => '',
    async tap(element) {
      actions.push(`tap ${element}`)
    },
    async enterText(element, text) {
      actions.push(`type ${text} in ${element}`)
    },
    async close() {},
  }
  const device = await createNativeTestTarget('android', driver).openDevice()
  await device.type('previewInput', 'Before locking')
  disabled = true
  await device.type('previewInput', 'Must not change')
  Tests.expect(actions).toEqual(['tap input', 'type Before locking in input', 'tap input'])
})
