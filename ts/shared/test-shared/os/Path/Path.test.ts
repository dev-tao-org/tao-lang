import * as Tests from '@shared-tests'
import { Path } from '@shared/os'
import { isWithin } from '../../../shared-src/os/Path'

Tests.test('containment rejects siblings, traversal and Windows drive or share changes', () => {
  Tests.expect(isWithin('/app', '/app/child', Path.posix)).toBe(true)
  Tests.expect(isWithin('/app', '/app', Path.posix)).toBe(true)
  Tests.expect(isWithin('/app', '/application', Path.posix)).toBe(false)
  Tests.expect(isWithin('/app', '/app/../outside', Path.posix)).toBe(false)
  Tests.expect(isWithin('C:\\App', 'C:\\Application', Path.win32)).toBe(false)
  Tests.expect(isWithin('C:\\App', 'c:\\app\\child', Path.win32)).toBe(true)
  Tests.expect(isWithin('C:\\App', 'C:\\App\\..\\outside', Path.win32)).toBe(false)
  Tests.expect(isWithin('C:\\App', 'D:\\App\\child', Path.win32)).toBe(false)
  Tests.expect(isWithin('\\\\host\\share\\app', '\\\\host\\other\\app', Path.win32)).toBe(false)
})
