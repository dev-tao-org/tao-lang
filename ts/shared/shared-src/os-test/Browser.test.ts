import { Errors } from '@shared'
import { Browser, Tests } from '@shared/os'

Tests.test('web opening selects Chrome after macOS host access and preserves background opening', async () => {
  const calls: unknown[] = []
  let denied = true
  const host = {
    os: 'Darwin',
    async requireAccess() {
      calls.push('host-access')
      if (denied) {
        Errors.ThrowHostEnvironment('Desktop access denied.')
      }
    },
    async start(command: readonly string[]) {
      calls.push(command)
      return 0
    },
  }
  const url = 'http://127.0.0.1:1234'
  await Tests.expect(Browser.openUrl(url, host)).rejects.toThrow('Desktop access denied.')
  Tests.expect(calls).toEqual(['host-access'])
  calls.length = 0
  denied = false
  await Browser.openUrl(url, host)
  Tests.expect(calls).toEqual(['host-access', ['open', '-g', '-a', 'Google Chrome', url]])
  calls.length = 0
  host.os = 'Linux'
  await Browser.openUrl(url, host)
  Tests.expect(calls).toEqual([['google-chrome', url]])
  calls.length = 0
  host.os = 'Windows_NT'
  await Browser.openUrl(url, host)
  Tests.expect(calls).toEqual([['cmd', '/c', 'start', '', 'chrome', url]])
})
