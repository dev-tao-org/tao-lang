import { Try } from '@shared'
import * as Tests from '@shared-tests'

import { beginPreviewRevision, isPreview } from '../../shared-src/os/preview/PreviewPlatform'

Tests.test('native window globals without iframe properties are ignored safely', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis })
  Try(() => {
    Tests.expect(isPreview()).toBe(false)
    Tests.expect(() => beginPreviewRevision('native')).not.toThrow()
  }, {
    finally() {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow)
      } else {
        Reflect.deleteProperty(globalThis, 'window')
      }
    },
  })
})
