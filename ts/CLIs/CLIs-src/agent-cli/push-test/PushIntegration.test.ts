import { Try } from '@shared'
import { FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { pushBranch, type PushIO } from '../push/Push'

Tests.test('a local guarded push updates only its destination despite broader remote configuration', async () => {
  await withRepository(async (root, remote) => {
    const before = await git(remote, ['rev-parse', 'refs/heads/main'])
    await FileSystem.writeFile(Path.join(root, 'fixture.txt'), 'approved update\n')
    await git(root, ['add', 'fixture.txt'])
    await git(root, ['commit', '-m', 'Fixture update'])
    await git(root, ['tag', '-a', 'fixture-tag', '-m', 'Do not publish this tag'])
    const commit = await git(root, ['rev-parse', 'HEAD'])
    await pushBranch('origin', 'feat/work', {}, localIO(root))
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/feat/work'])).toBe(commit)
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/main'])).toBe(before)
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/keep'])).toBe(before)
    Tests.expect(await git(remote, ['tag', '--list'])).toBe('')
    await pushBranch('origin', 'backup/work', { source: 'feat/work' }, localIO(root))
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/backup/work'])).toBe(commit)
    await Tests.rejects(pushBranch('origin', 'main', {}, localIO(root)))
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/main'])).toBe(before)
  })
})

async function withRepository(action: (root: string, remote: string) => Promise<void>): Promise<void> {
  const directory = Repo.resolvePath('.artifacts/tmp/push-test', Platform.randomUUID())
  const root = Path.join(directory, 'source')
  const remote = Path.join(directory, 'remote.git')
  await FileSystem.mkdir(root)
  await Try(async () => {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', '--local', 'user.name', 'Push Fixture'])
    await git(root, ['config', '--local', 'user.email', 'push@example.invalid'])
    await FileSystem.writeFile(Path.join(root, 'fixture.txt'), 'baseline\n')
    await git(root, ['add', 'fixture.txt'])
    await git(root, ['commit', '-m', 'Fixture baseline'])
    await git(root, ['branch', 'keep'])
    await git(root, ['switch', '-c', 'feat/work'])
    await git(directory, ['clone', '--bare', root, remote])
    await git(root, ['remote', 'add', 'origin', remote])
    await git(root, ['config', '--local', 'remote.origin.mirror', 'true'])
    await git(root, ['config', '--local', 'push.followTags', 'true'])
    await git(root, ['config', '--local', 'push.recurseSubmodules', 'on-demand'])
    await action(root, remote)
  }, { finally: () => FileSystem.rm(directory, { recursive: true, force: true }) })
}

function localIO(root: string): PushIO {
  return {
    capture: args => git(root, args),
    async run(args) {
      await git(root, args)
    },
  }
}

async function git(root: string, args: readonly string[]): Promise<string> {
  return Platform.capture('git', { variadicArgs: args, cwd: root })
}
