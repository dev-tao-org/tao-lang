import { Test } from '@shared/os'
import { resolveHostCommand } from '../cli-kit/host-commands'

Test.test('host routing selects the longest exact token prefix', () => {
  Test.expect(resolveHostCommand(
    ['local-instantdb', 'start', '--quiet'],
    ['local-instantdb', 'local-instantdb start'],
  )).toEqual({ command: './dev start local-instantdb', variadicArgs: ['--quiet'] })
})

Test.test('native Git arguments stay literal and in their original order', () => {
  const injected = '$(touch /tmp/host-command-injection)'
  Test.expect(resolveHostCommand(
    ['git', 'commit', '--message', injected, 'file with spaces.tao'],
    ['git commit'],
  )).toEqual({
    command: 'git commit',
    variadicArgs: ['--message', injected, 'file with spaces.tao'],
  })
})

Test.test('host routing rejects empty, option-led, substring, and unsupported legacy requests', () => {
  Test.expect(() => resolveHostCommand([], ['git status'])).toThrow('Name an allowlisted host command')
  Test.expect(() => resolveHostCommand(['--help'], ['git status'])).toThrow('without leading options')
  Test.expect(() => resolveHostCommand(['gitcommit'], ['git commit'])).toThrow('not allowlisted')
  Test.expect(() => resolveHostCommand(['land'], ['land'])).toThrow('no supported target')
})

Test.test('host routing rejects malformed and duplicate allowlist prefix arrays', () => {
  Test.expect(() => resolveHostCommand(['git', 'status'], 'git status')).toThrow('must be an array')
  Test.expect(() => resolveHostCommand(['git', 'status'], [''])).toThrow('nonempty strings')
  Test.expect(() => resolveHostCommand(['git', 'status'], ['git status', 'git status'])).toThrow('Duplicate')
})
