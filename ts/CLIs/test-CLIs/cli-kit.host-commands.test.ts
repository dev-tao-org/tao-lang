import * as Tests from '@shared-tests'

import { runHostCommand } from '../CLIs-src/cli-kit/host-commands'

Tests.test('host command rejects leading options and unallowlisted operations before host access', async () => {
  await Tests.expect(runHostCommand(['--help'])).rejects.toThrow('without leading options')
  await Tests.expect(runHostCommand(['not-an-allowed-host-operation'])).rejects.toThrow('is not allowlisted')
})
