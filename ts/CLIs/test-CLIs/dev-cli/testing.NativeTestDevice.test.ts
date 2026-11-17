import { Errors } from '@shared'
import * as Tests from '@shared-tests'
import { createNativeTestTarget } from '../../CLIs-src/dev-cli/testing/NativeTestDevice'
import type { NativeWebDriver } from '../../CLIs-src/dev-cli/testing/NativeWebDriver'

Tests.test('Android text entry taps the input and types only while it is editable', async () => {
  const actions: string[] = []
  let disabled = false
  const driver = recordingDriver(actions, {
    find: async () => ['input'],
    attribute: async (_element, name) => name === 'focused' ? 'true' : String(!disabled),
  })
  const device = await createNativeTestTarget('android', driver).openDevice()
  await device.type('previewInput', 'Before locking')
  disabled = true
  await device.type('previewInput', 'Must not change')
  Tests.expect(actions).toEqual(['tap input', 'type Before locking in input', 'tap input'])
})

Tests.test('Android waits once for the System UI dialog and still requires the app control', async () => {
  const actions: string[] = []
  let dialogChecks = 0
  const driver = recordingDriver(actions, {
    async find(selector) {
      if (selector.includes("System UI isn't responding")) {
        Tests.expect(selector).toContain("@resource-id='android:id/aerr_wait'")
        return ++dialogChecks <= 2 ? ['wait'] : []
      }
      Tests.expect(selector).toBe("//*[@resource-id='continue']")
      return dialogChecks >= 2 ? ['continue'] : []
    },
  })
  const device = await createNativeTestTarget('android', driver).openDevice()
  await device.press('continue')
  Tests.expect(actions).toEqual(['tap wait', 'tap continue'])
})

function recordingDriver(actions: string[], overrides: Partial<NativeWebDriver>): NativeWebDriver {
  return {
    execute: async script => Errors.ThrowShouldNeverHappen(`Unexpected Appium script ${script}.`),
    find: async selector => Errors.ThrowShouldNeverHappen(`Unexpected Appium selector ${selector}.`),
    attribute: async (_element, name) => Errors.ThrowShouldNeverHappen(`Unexpected Appium attribute ${name}.`),
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
    ...overrides,
  }
}
