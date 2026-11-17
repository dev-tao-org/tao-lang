import { UserInput } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, Env, Path } from '@shared/os'
import Exec from '@shared/os/exec'

type EnvironmentValue = string | undefined
type MutableEnvironment = Record<string, EnvironmentValue>

Tests.test('environment values are copies and clones stay independent', () => {
  const key = 'TAO_ENV_CLONE_PROBE'
  const original = Env.get(key)
  const values = Env.values() as MutableEnvironment
  values[key] = 'changed-copy'
  Tests.expect(Env.get(key)).toBe(original)

  const clone = Env.clone({ [key]: 'clone-value' })
  Tests.expect(clone.get(key)).toBe('clone-value')
  const cloneValues = clone.values() as MutableEnvironment
  cloneValues[key] = 'changed-copy'
  Tests.expect(clone.get(key)).toBe('clone-value')
  Tests.expect(Env.get(key)).toBe(original)
})

Tests.test('environment scopes isolate concurrent work, nesting, failures and child defaults', async () => {
  const key = 'TAO_ENV_SCOPE_PROBE'
  const original = Env.get(key)
  const bothEntered = Promise.withResolvers<void>()
  let enteredScopes = 0
  await Promise.all(['left', 'right'].map(value =>
    Tests.withEnv({ [key]: value }, async () => {
      enteredScopes++
      if (enteredScopes === 2) {
        bothEntered.resolve()
      }
      await bothEntered.promise
      Tests.expect(Env.get(key)).toBe(value)
      Tests.expect(Env.KeyValuePairs([key])).toEqual([[key, value]])
      const child = await Exec.capture('bun', ['-e', 'process.stdout.write(process.env.TAO_ENV_SCOPE_PROBE)'])
      Tests.expect(child.stdout).toBe(value)
      Tests.throws(() => Tests.withEnv({ [key]: 'nested' }, () => UserInput.fail('scope failure')))
      Tests.expect(Env.get(key)).toBe(value)
      const rejectScope = Promise.withResolvers<void>()
      const failedScope = Tests.withEnv({ [key]: 'rejected' }, async () => {
        await rejectScope.promise
        UserInput.fail('async scope failure')
      })
      rejectScope.resolve()
      await Tests.rejects(failedScope)
      Tests.expect(Env.get(key)).toBe(value)
    })
  ))
  Tests.expect(Env.get(key)).toBe(original)
})

Tests.test('home helpers use the scoped environment without changing the host home', () => {
  const original = Path.home()
  const home = Artifacts.resolvePath('tmp', 'scoped-home')
  Tests.withEnv({ HOME: home, USERPROFILE: home }, () => {
    Tests.expect(Path.home()).toBe(home)
    Tests.expect(Path.home('child')).toBe(Path.join(home, 'child'))
    Tests.expect(Path.home.tao('cache')).toBe(Path.join(home, '.tao', 'cache'))
    Tests.expect(Path.home.taoDev('shell')).toBe(Path.join(home, '.tao-dev', 'shell'))
  })
  Tests.expect(Path.home()).toBe(original)
})
