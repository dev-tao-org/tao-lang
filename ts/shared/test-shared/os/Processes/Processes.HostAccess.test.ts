import { Errors } from '@shared'
import * as Tests from '@shared-tests'

import * as Processes from '../../../shared-src/os/Processes'

const HostProcessAccessUnavailableRegx = /Host process access is unavailable.*Chrome was not launched/

Tests.test('restricted host inspection fails clearly before a browser can be launched', async () => {
  await Tests.rejects(
    () =>
      Processes.requireHostProcessAccess('Chrome was not launched.', async () => {
        Errors.ThrowHostEnvironment('Process inspection denied.')
      }),
    HostProcessAccessUnavailableRegx,
  )
})
