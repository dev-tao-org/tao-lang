import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

Tests.test('a local guarded push updates only its destination despite broader remote configuration', async () => {
  await withRepository(async (root, remote) => {
    const before = await git(remote, ['rev-parse', 'refs/heads/main'])
    await FS.writeFile(Path.join(root, 'fixture.txt'), 'approved update' + NewlineCharacter)
    await git(root, ['add', 'fixture.txt'])
    await git(root, ['commit', '-m', 'Fixture update'])
    await git(root, ['tag', '-a', 'fixture-tag', '-m', 'Do not publish this tag'])
    const commit = await git(root, ['rev-parse', 'HEAD'])
    await push(root, ['origin', 'feat/work'])
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/feat/work'])).toBe(commit)
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/main'])).toBe(before)
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/keep'])).toBe(before)
    Tests.expect(await git(remote, ['tag', '--list'])).toBe('')
    await push(root, ['origin', 'backup/work', '--source', 'feat/work'])
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/backup/work'])).toBe(commit)
    await Tests.rejects(push(root, ['origin', 'main']))
    Tests.expect(await git(remote, ['rev-parse', 'refs/heads/main'])).toBe(before)
  })
})

async function withRepository(action: (root: string, remote: string) => Promise<void>): Promise<void> {
  const directory = Repo.resolvePath('.artifacts/tmp/push-test', Platform.randomUUID())
  const root = Path.join(directory, 'source')
  const remote = Path.join(directory, 'remote.git')
  await FS.mkdir(root)
  await Try(async () => {
    await git(root, ['init', '-b', 'main'])
    await git(root, ['config', '--local', 'user.name', 'Push Fixture'])
    await git(root, ['config', '--local', 'user.email', 'push@example.invalid'])
    await FS.writeFile(Path.join(root, 'fixture.txt'), 'baseline' + NewlineCharacter)
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
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
}

async function push(root: string, args: readonly string[]): Promise<void> {
  const addEnv = { GIT_DIR: Path.join(root, '.git'), GIT_WORK_TREE: root }
  await Exec.capture(Repo.resolvePath('agent'), ['push', ...args], { cwd: root, addEnv })
}

async function git(root: string, args: readonly string[]): Promise<string> {
  return Exec.captureStdout('git', args, { cwd: root })
}
