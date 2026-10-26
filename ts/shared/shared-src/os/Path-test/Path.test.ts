import { Tests } from '@shared/os'
import { posix, win32 } from 'node:path'
import { isWithin } from '../Path'

Tests.test('containment rejects siblings, traversal and Windows drive or share changes', () => {
  Tests.expect(isWithin('/app', '/app/child', posix)).toBe(true)
  Tests.expect(isWithin('/app', '/app', posix)).toBe(true)
  Tests.expect(isWithin('/app', '/application', posix)).toBe(false)
  Tests.expect(isWithin('/app', '/app/../outside', posix)).toBe(false)
  Tests.expect(isWithin('C:\\App', 'C:\\Application', win32)).toBe(false)
  Tests.expect(isWithin('C:\\App', 'c:\\app\\child', win32)).toBe(true)
  Tests.expect(isWithin('C:\\App', 'C:\\App\\..\\outside', win32)).toBe(false)
  Tests.expect(isWithin('C:\\App', 'D:\\App\\child', win32)).toBe(false)
  Tests.expect(isWithin('\\\\host\\share\\app', '\\\\host\\other\\app', win32)).toBe(false)
})
