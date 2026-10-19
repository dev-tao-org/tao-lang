import { Tests } from '@shared/os'
import { expoEnvironment } from '../../runtime-src/expo/Expo'

Tests.test('managed Expo servers keep refresh enabled without preparing native debugger apps or opening browsers', () => {
  const environment = expoEnvironment('/fixture/runtime')
  Tests.expect(environment.EXPO_UNSTABLE_HEADLESS).toBe('1')
  Tests.expect(environment.BROWSER).toBe('none')
  Tests.expect(environment.CI).toBe('false')
  Tests.expect(environment.EXPO_OFFLINE).toBe('1')
  Tests.expect(environment.EXPO_NO_TYPESCRIPT_SETUP).toBe('1')
  Tests.expect(environment.PATH?.startsWith('/fixture/runtime/node_modules/.bin')).toBe(true)
})
