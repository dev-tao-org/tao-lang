import { runNonInteractiveCommand } from '@cli-kit'
import { Try } from '@shared'
import { FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { receiveSnapshot } from '../performance-investigation/Checkout'
import { runMeasurements } from '../performance-investigation/Runner'
import { createSnapshot } from '../performance-investigation/Snapshot'

Tests.test('performance bundles retain saved source and history without changing staged selections', async () => {
  const root = Repo.resolvePath('.artifacts/tmp/performance-snapshot', Platform.randomUUID())
  await FileSystem.mkdir(root, { recursive: true })
  const git = (...args: string[]) => Platform.capture('git', { variadicArgs: args, cwd: root, trim: false })
  await Try(async () => {
    await git('init', '-b', 'main')
    await git('config', '--local', 'user.name', 'Performance fixture')
    await git('config', '--local', 'user.email', 'performance@example.invalid')
    await git('config', '--local', 'core.filemode', 'false')
    await git('config', '--local', 'core.symlinks', 'false')
    await FileSystem.writeFile(Path.join(root, '.git/info/exclude'), '.artifacts/\n')
    await FileSystem.writeFile(Path.join(root, 'source.ts'), 'baseline\n')
    await FileSystem.writeFile(Path.join(root, 'deleted.ts'), 'deleted\n')
    await FileSystem.symlink('source.ts', Path.join(root, 'replaced.ts'))
    await git('add', '.')
    await git('commit', '-m', 'Baseline')
    const head = (await git('rev-parse', 'HEAD')).trim()
    await FileSystem.writeFile(Path.join(root, 'source.ts'), 'staged\n')
    await git('add', 'source.ts')
    await FileSystem.writeFile(Path.join(root, 'source.ts'), 'saved\n')
    await FileSystem.chmod(Path.join(root, 'source.ts'), 0o755)
    await FileSystem.rm(Path.join(root, 'replaced.ts'))
    await FileSystem.writeFile(Path.join(root, 'replaced.ts'), 'saved regular contents\n')
    await FileSystem.rm(Path.join(root, 'deleted.ts'))
    await FileSystem.writeFile(Path.join(root, 'new file.ts'), 'untracked\n')
    await FileSystem.chmod(Path.join(root, 'new file.ts'), 0o755)
    await FileSystem.symlink('source.ts', Path.join(root, 'linked.ts'))
    const index = await FileSystem.readFile(Path.join(root, '.git/index'))
    const status = await git('--no-optional-locks', 'status', '--porcelain=v1', '-uall')
    const snapshot = await createSnapshot(root)
    Tests.expect(await FileSystem.readFile(Path.join(root, '.git/index'))).toEqual(index)
    Tests.expect(await git('--no-optional-locks', 'status', '--porcelain=v1', '-uall')).toBe(status)
    Tests.expect((await git('rev-parse', 'HEAD')).trim()).toBe(head)
    await verifyBundle(snapshot.bundle, snapshot.commit, head, root)
    await verifyEmbeddedRejection(root, git)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function verifyBundle(bundle: string, commit: string, head: string, root: string): Promise<void> {
  const clone = Path.join(root, '.artifacts/clone')
  const manifest = Path.join(Path.dirname(bundle), 'snapshot.json')
  await receiveWithLineEndingConfiguration(bundle, manifest, clone)
  await Tests.expect(receiveSnapshot(bundle, manifest, clone)).rejects.toThrow('destination already exists')
  const git = (...args: string[]) => Platform.capture('git', { variadicArgs: args, cwd: clone })
  Tests.expect(await git('rev-parse', 'HEAD')).toBe(commit)
  Tests.expect(await git('rev-parse', 'HEAD^')).toBe(head)
  Tests.expect(await FileSystem.readFile(Path.join(clone, 'source.ts'), 'utf8')).toBe('saved\n')
  Tests.expect(await FileSystem.readFile(Path.join(clone, 'new file.ts'), 'utf8')).toBe('untracked\n')
  Tests.expect(await FileSystem.exists(Path.join(clone, 'deleted.ts'))).toBe(false)
  Tests.expect(await FileSystem.readlink(Path.join(clone, 'linked.ts'))).toBe('source.ts')
  Tests.expect((await FileSystem.lstat(Path.join(clone, 'replaced.ts'))).isFile()).toBe(true)
  Tests.expect(await FileSystem.readFile(Path.join(clone, 'replaced.ts'), 'utf8')).toBe('saved regular contents\n')
  Tests.expect(await git('ls-files', '--stage', '--', 'new file.ts')).toStartWith('100755 ')
  Tests.expect(await git('ls-files', '--stage', '--', 'source.ts')).toStartWith('100755 ')
  Tests.expect(await git('ls-files', '--', '.artifacts')).toBe('')
  await git('config', '--local', 'core.autocrlf', 'true')
  await FileSystem.writeFile(Path.join(clone, 'source.ts'), 'saved\r\n')
  await git('add', '--', 'source.ts')
  Tests.expect(await git('status', '--porcelain')).toBe('')
  await Tests.expect(runMeasurements({ repo: clone, fixture: Path.join(clone, 'source.ts'), samples: 1, edits: 4 }))
    .rejects.toThrow('source differs from the captured Git tree')
}

async function receiveWithLineEndingConfiguration(bundle: string, manifest: string, clone: string): Promise<void> {
  await runNonInteractiveCommand('./agent skill-script', {
    variadicArgs: [
      'agents/skills/performance-investigation/scripts/performance.ts',
      '--',
      'receive',
      '--bundle',
      bundle,
      '--manifest',
      manifest,
      '--directory',
      clone,
    ],
    cwd: Repo.getWorkspaceRoot(),
    env: {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.autocrlf',
      GIT_CONFIG_VALUE_0: 'true',
    },
  })
}

async function verifyEmbeddedRejection(root: string, git: (...args: string[]) => Promise<string>): Promise<void> {
  const embedded = Path.join(root, 'embedded')
  await FileSystem.mkdir(embedded)
  await git('-C', embedded, 'init', '-b', 'main')
  await FileSystem.writeFile(Path.join(embedded, 'inside.ts'), 'committed\n')
  await git('-C', embedded, 'add', '.')
  await git(
    '-C',
    embedded,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'Nested',
  )
  await FileSystem.writeFile(Path.join(embedded, 'inside.ts'), 'saved\n')
  await Tests.expect(createSnapshot(root)).rejects.toThrow('undeclared embedded Git repository')
}
