import * as Tests from '@shared-tests'

import { setupStorage } from '../CLIs-src/dev-cli/SetupStorage'

Tests.test('setup initializes missing storage once and preserves existing storage checkouts', async () => {
  let status = '-0123456789 .storage'
  let initializations = 0
  const io = {
    status: async () => status,
    async initialize() {
      initializations++
      status = ' 0123456789 .storage'
    },
  }
  await setupStorage(io)
  await setupStorage(io)
  Tests.expect(initializations).toBe(1)
  for (const existing of ['+0123456789 .storage', 'U0123456789 .storage', '']) {
    status = existing
    await setupStorage(io)
  }
  Tests.expect(initializations).toBe(1)
})
