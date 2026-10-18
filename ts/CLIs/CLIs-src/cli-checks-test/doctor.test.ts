import { Tests } from '@shared/os'
import { assertDoctorReady, diagnoseTools, safeToken, toolVersion } from '../cli-checks/doctor'

Tests.test('fingerprints admit versions and hashes while excluding identifying probe output', () => {
  for (const value of ['/Users/person/repo', 'person@example.com', 'host name', 'https://example.com', '', undefined]) {
    Tests.expect(safeToken(value)).toBeUndefined()
  }
  Tests.expect(safeToken('abc123-dirty')).toBe('abc123-dirty')
  Tests.expect(toolVersion('node v24.0.1\n/Users/person')).toBe('24.0.1')
  Tests.expect(toolVersion('Docker version 28.5.1, build abc123')).toBe('28.5.1')
  Tests.expect(toolVersion('tool /Users/person')).toBeUndefined()
})

Tests.test('doctor distinguishes required runtime failures from optional service setup', () => {
  const checks = diagnoseTools(['node', 'bun', 'bun', 'bun', 'docker', 'age', 'tsc'], [
    'v23.0.0',
    '1.4.1',
    '1.4.2',
    '2.0.0',
    undefined,
    undefined,
    undefined,
  ])
  Tests.expect(checks.map(check => check.status)).toEqual(['fail', 'fail', 'pass', 'pass', 'warn', 'warn', 'fail'])
  Tests.expect(() => assertDoctorReady('fail')).toThrow('required setup failures')
  Tests.expect(assertDoctorReady('warn')).toBeUndefined()
})

Tests.test('doctor preserves a failed required tool probe diagnostic', () => {
  const [check] = diagnoseTools(['dprint'], [undefined], ['Formatter startup failed: missing runtime library.'])
  Tests.expect(check?.status).toBe('fail')
  Tests.expect(check?.detail).toBe('Formatter startup failed: missing runtime library.')
  Tests.expect(diagnoseTools(['dprint'], ['Unexpected formatter output.'])[0]?.detail)
    .toBe('Unexpected formatter output.')
})
