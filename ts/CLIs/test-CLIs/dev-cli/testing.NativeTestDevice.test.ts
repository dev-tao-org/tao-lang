import { Errors } from '@shared'
import * as Tests from '@shared-tests'
import { createNativeTestTarget } from '../../CLIs-src/dev-cli/testing/NativeTestDevice'
import type { NativeWebDriver } from '../../CLIs-src/dev-cli/testing/NativeWebDriver'

Tests.test('Android text entry dismisses the keyboard without navigating Back', async () => {
  const actions: string[] = []
  const driver: NativeWebDriver = {
    execute: async script => Errors.ThrowShouldNeverHappen(`Unexpected Appium script ${script}.`),
    find: async () => ['input'],
    attribute: async () => undefined,
    isDisplayed: async () => true,
    isKeyboardShown: async () => true,
    async hideKeyboard() {
      actions.push('hide keyboard')
    },
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
  Tests.expect(actions).toEqual(['tap input', 'type Before locking in input', 'hide keyboard'])
})
