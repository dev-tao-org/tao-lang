import { Tests } from '@shared/os'
import { resolveHostCommand } from '../cli-kit/host-commands'

Tests.test('host routing selects the longest exact token prefix', () => {
  Tests.expect(resolveHostCommand(
    ['local-instantdb', 'start', '--quiet'],
    ['local-instantdb', 'local-instantdb start'],
  )).toEqual({ command: './dev start local-instantdb', variadicArgs: ['--quiet'] })
})

Tests.test('preview browser proof has a narrow named host route', () => {
  Tests.expect(resolveHostCommand(['performance', 'preview'], ['performance preview']))
    .toEqual({ command: './dev performance preview', variadicArgs: [] })
  Tests.expect(() => resolveHostCommand(['performance', 'parser'], ['performance preview'])).toThrow('not allowlisted')
  Tests.expect(resolveHostCommand(['performance', 'record'], ['performance record']))
    .toEqual({ command: './dev performance record', variadicArgs: [] })
})

Tests.test('native Git arguments stay literal and in their original order', () => {
  const injected = '$(touch /tmp/host-command-injection)'
  Tests.expect(resolveHostCommand(
    ['git', 'commit', '--message', injected, 'file with spaces.tao'],
    ['git commit'],
  )).toEqual({
    command: 'git commit',
    variadicArgs: ['--message', injected, 'file with spaces.tao'],
  })
})

Tests.test('host routing rejects empty, option-led, substring, and unsupported legacy requests', () => {
  Tests.expect(() => resolveHostCommand([], ['git status'])).toThrow('Name an allowlisted host command')
  Tests.expect(() => resolveHostCommand(['--help'], ['git status'])).toThrow('without leading options')
  Tests.expect(() => resolveHostCommand(['gitcommit'], ['git commit'])).toThrow('not allowlisted')
  Tests.expect(resolveHostCommand(['land'], ['land'])).toEqual({ command: './dev land', variadicArgs: [] })
  Tests.expect(() => resolveHostCommand(['unsupported'], ['unsupported'])).toThrow('no supported target')
})

Tests.test('host routing rejects malformed and duplicate allowlist prefix arrays', () => {
  Tests.expect(() => resolveHostCommand(['git', 'status'], 'git status')).toThrow('must be an array')
  Tests.expect(() => resolveHostCommand(['git', 'status'], [''])).toThrow('nonempty strings')
  Tests.expect(() => resolveHostCommand(['git', 'status'], ['git status', 'git status'])).toThrow('Duplicate')
})
