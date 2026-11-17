import { UserInput } from '@shared'
import * as Tests from '@shared-tests'

import { createRetryableInitialization } from '../tao-ide-extension-src/RetryableInitialization'

Tests.test('WASM initialization retries after rejection and caches a successful result', async () => {
  let attempts = 0
  const initialize = createRetryableInitialization(async () => {
    attempts += 1
    return attempts === 1 ? UserInput.fail('first initialization failed') : 'ready'
  })

  await Tests.expect(initialize()).rejects.toThrow('first initialization failed')
  Tests.expect(await initialize()).toBe('ready')
  Tests.expect(await initialize()).toBe('ready')
  Tests.expect(attempts).toBe(2)
})
