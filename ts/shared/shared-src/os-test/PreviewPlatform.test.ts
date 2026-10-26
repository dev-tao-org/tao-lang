import { Try } from '@shared'
import { Tests } from '@shared/os'
import { beginPreviewRevision, isPreview } from '../os/preview/PreviewPlatform'

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
