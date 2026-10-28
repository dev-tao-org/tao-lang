import { Errors } from '@shared'
import { Platform, Tests } from '@shared/os'

const HostProcessAccessUnavailableRegx = /Host process access is unavailable.*Chrome was not launched/

Tests.test('restricted host inspection fails clearly before a browser can be launched', async () => {
  await Tests.rejects(
    () =>
      Platform.requireHostProcessAccess('Chrome was not launched.', async () => {
        Errors.ThrowHostEnvironment('Process inspection denied.')
      }),
    HostProcessAccessUnavailableRegx,
  )
})
