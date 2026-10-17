import { Test } from '@shared/os'
import { assertDoctorReady, diagnoseGitHub, diagnoseTools, safeToken, toolVersion } from '../cli-checks/doctor'

Test.test('fingerprints admit versions and hashes while excluding identifying probe output', () => {
  for (const value of ['/Users/person/repo', 'person@example.com', 'host name', 'https://example.com', '', undefined]) {
    Test.expect(safeToken(value)).toBeUndefined()
  }
  Test.expect(safeToken('abc123-dirty')).toBe('abc123-dirty')
  Test.expect(toolVersion('node v24.0.1\n/Users/person')).toBe('24.0.1')
  Test.expect(toolVersion('Docker version 28.5.1, build abc123')).toBe('28.5.1')
  Test.expect(toolVersion('tool /Users/person')).toBeUndefined()
})

Test.test('doctor distinguishes required runtime failures from optional service setup', () => {
  const checks = diagnoseTools(['node', 'bun', 'bun', 'bun', 'docker', 'age', 'tsc'], [
    'v23.0.0',
    '1.4.1',
    '1.4.2',
    '2.0.0',
    undefined,
    undefined,
    undefined,
  ])
  Test.expect(checks.map(check => check.status)).toEqual(['fail', 'fail', 'pass', 'pass', 'warn', 'warn', 'fail'])
  Test.expect(() => assertDoctorReady('fail')).toThrow('required setup failures')
  Test.expect(assertDoctorReady('warn')).toBeUndefined()
})

Test.test('doctor fails broken HTTPS transport and warns about rewrites or incorrect credential helpers', () => {
  const url = 'https://github.com/tao-dev-org/tao-lang.git'
  Test.expect(diagnoseGitHub(undefined, undefined, undefined).status).toBe('fail')
  Test.expect(
    diagnoseGitHub('git@github.com:tao-dev-org/tao-lang.git', 'git@github.com:tao-dev-org/tao-lang.git', '').status,
  ).toBe('fail')
  Test.expect(diagnoseGitHub('git@github.com:tao-dev-org/tao-lang.git', url, '!gh auth git-credential').status).toBe(
    'warn',
  )
  Test.expect(diagnoseGitHub(url, url, '!').status).toBe('warn')
  Test.expect(diagnoseGitHub(url, url, 'osxkeychain').status).toBe('warn')
  Test.expect(diagnoseGitHub(url, url, '!gh auth git-credential').status).toBe('pass')
})
