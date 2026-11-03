import { Errors, S } from '@shared'
import * as Tests from '@shared-tests'

import { pushBranch, type PushIO } from '../../../CLIs-src/agent-cli/push/Push'

Tests.test('guarded pushes reject main and refspec or option inputs before publishing', async () => {
  const calls: string[][] = []
  const io = recordingIO(calls)
  for (const branch of ['main', 'MAIN', 'feature:main', '+feature', '--all', '--mirror', 'refs/heads/main', '']) {
    await Tests.rejects(pushBranch('origin', branch, {}, io))
  }
  await Tests.rejects(pushBranch('origin', 'feat/work', { source: 'feat/work:main' }, io))
  Tests.expect(calls).toEqual([])
})

Tests.test('guarded pushes pin one branch and neutralize implicit mirror, tag and submodule pushes', async () => {
  const calls: string[][] = []
  await pushBranch('origin', 'feat/work', {}, recordingIO(calls))
  Tests.expect(calls).toEqual([
    ['check-ref-format', 'refs/heads/feat/work'],
    ['check-ref-format', 'refs/heads/feat/work'],
    ['remote'],
    ['rev-parse', '--verify', 'refs/heads/feat/work^{commit}'],
    [
      '-c',
      'remote.origin.mirror=false',
      '-c',
      'push.followTags=false',
      'push',
      '--no-follow-tags',
      '--recurse-submodules=no',
      '--',
      'origin',
      `${commit}:refs/heads/feat/work`,
    ],
  ])
})

Tests.test('backup destinations can select a source branch and unconfigured remotes fail before publishing', async () => {
  const calls: string[][] = []
  const io = recordingIO(calls)
  await pushBranch('origin', 'backup/feat/work', { source: 'feat/work' }, io)
  Tests.expect(calls[3]).toEqual(['rev-parse', '--verify', 'refs/heads/feat/work^{commit}'])
  Tests.expect(calls[4]?.at(-1)).toBe(`${commit}:refs/heads/backup/feat/work`)
  calls.length = 0
  for (const remote of ['', '--all', 'https://example.invalid/repo']) {
    await Tests.rejects(pushBranch(remote, 'feat/work', {}, io))
  }
  Tests.expect(calls.some(args => args.includes('push'))).toBe(false)
})

Tests.test('push failures propagate without retries or force flags', async () => {
  const calls: string[][] = []
  const io = recordingIO(calls)
  io.run = async args => {
    calls.push([...args])
    Errors.ThrowUserInput('Non-fast-forward fixture rejection')
  }
  await Tests.rejects(pushBranch('origin', 'feat/work', {}, io))
  Tests.expect(calls.filter(args => args.includes('push'))).toHaveLength(1)
  Tests.expect(calls.flat().some(arg => arg.startsWith('--force'))).toBe(false)
})

const commit = '1'.repeat(40)

function recordingIO(calls: string[][]): PushIO {
  return {
    async capture(args) {
      calls.push([...args])
      if (args[0] === 'remote') {
        return S`
          origin
          upstream
        `
      }
      return args[0] === 'rev-parse' ? commit : ''
    },
    async run(args) {
      calls.push([...args])
    },
  }
}
