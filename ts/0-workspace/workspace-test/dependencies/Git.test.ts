import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { fetchGitHubCommit, localGitRepository, resolveGitHubCommit } from '../../workspace-src/dependencies/Git'

Tests.test('Git adapter resolves a local tag and materializes the exact commit', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-git-${Platform.randomUUID()}`)
  const repository = Path.join(root, 'source repository')
  const destination = Path.join(root, 'cached source')
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    await localGitRepository(repository)
    await FileSystem.writeFile(Path.join(repository, 'Main.tao'), 'view Main { render "fixture" }')
    await Platform.capture('git', { variadicArgs: ['-C', repository, 'add', 'Main.tao'] })
    await Platform.capture('git', { variadicArgs: ['-C', repository, 'commit', '--quiet', '-m', 'fixture'] })
    await Platform.capture('git', { variadicArgs: ['-C', repository, 'tag', '-a', 'v1', '-m', 'release'] })
    const commit = await Platform.capture('git', { variadicArgs: ['-C', repository, 'rev-parse', 'HEAD'] })
    Tests.expect(await resolveGitHubCommit(repository, 'v1')).toBe(commit)
    await fetchGitHubCommit(repository, commit, destination)
    Tests.expect(await Platform.capture('git', { variadicArgs: ['-C', destination, 'rev-parse', 'HEAD'] })).toBe(commit)
    Tests.expect(await FileSystem.readFile(Path.join(destination, 'Main.tao'), 'utf8')).toContain('fixture')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})
