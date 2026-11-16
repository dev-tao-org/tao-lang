import * as CLIKit from '@cli-kit'
import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { receiveSnapshot } from '../../CLIs-src/agent-skills/performance-investigation/Checkout'
import { runMeasurements } from '../../CLIs-src/agent-skills/performance-investigation/Runner'
import { createSnapshot } from '../../CLIs-src/agent-skills/performance-investigation/Snapshot'

Tests.test('performance bundles retain saved source and history without changing staged selections', async () => {
  const root = Repo.resolvePath('.artifacts/tmp/performance-snapshot', Platform.randomUUID())
  await FS.mkdir(root)
  const git = (...args: string[]) => Exec.captureStdout('git', args, { cwd: root, trim: false })
  await Try(async () => {
    await git('init', '-b', 'main')
    await git('config', '--local', 'user.name', 'Performance fixture')
    await git('config', '--local', 'user.email', 'performance@example.invalid')
    await git('config', '--local', 'core.filemode', 'false')
    await git('config', '--local', 'core.symlinks', 'false')
    await FS.writeFile(Path.join(root, '.git/info/exclude'), '.artifacts/\n')
    await FS.writeFile(Path.join(root, 'source.ts'), 'baseline\n')
    await FS.writeFile(Path.join(root, 'deleted.ts'), 'deleted\n')
    await FS.symlink('source.ts', Path.join(root, 'replaced.ts'))
    await git('add', '.')
    await git('commit', '-m', 'Baseline')
    const head = (await git('rev-parse', 'HEAD')).trim()
    await FS.writeFile(Path.join(root, 'source.ts'), 'staged\n')
    await git('add', 'source.ts')
    await FS.writeFile(Path.join(root, 'source.ts'), 'saved\n')
    await FS.chmod(Path.join(root, 'source.ts'), 0o755)
    await FS.rm(Path.join(root, 'replaced.ts'))
    await FS.writeFile(Path.join(root, 'replaced.ts'), 'saved regular contents\n')
    await FS.rm(Path.join(root, 'deleted.ts'))
    await FS.writeFile(Path.join(root, 'new file.ts'), 'untracked\n')
    await FS.chmod(Path.join(root, 'new file.ts'), 0o755)
    await FS.symlink('source.ts', Path.join(root, 'linked.ts'))
    const index = await FS.readFile(Path.join(root, '.git/index'))
    const status = await git('--no-optional-locks', 'status', '--porcelain=v1', '-uall')
    const snapshot = await createSnapshot(root)
    Tests.expect(await FS.readFile(Path.join(root, '.git/index'))).toEqual(index)
    Tests.expect(await git('--no-optional-locks', 'status', '--porcelain=v1', '-uall')).toBe(status)
    Tests.expect((await git('rev-parse', 'HEAD')).trim()).toBe(head)
    await verifyBundle(snapshot.bundle, snapshot.commit, head, root)
    await verifyEmbeddedRejection(root, git)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

async function verifyBundle(bundle: string, commit: string, head: string, root: string): Promise<void> {
  const clone = Path.join(root, '.artifacts/clone')
  const manifest = Path.join(Path.dirname(bundle), 'snapshot.json')
  await receiveWithLineEndingConfiguration(bundle, manifest, clone)
  await Tests.expect(receiveSnapshot(bundle, manifest, clone)).rejects.toThrow('destination already exists')
  const git = (...args: string[]) => Exec.captureStdout('git', args, { cwd: clone })
  Tests.expect(await git('rev-parse', 'HEAD')).toBe(commit)
  Tests.expect(await git('rev-parse', 'HEAD^')).toBe(head)
  Tests.expect(await FS.readFile(Path.join(clone, 'source.ts'), 'utf8')).toBe('saved\n')
  Tests.expect(await FS.readFile(Path.join(clone, 'new file.ts'), 'utf8')).toBe('untracked\n')
  Tests.expect(await FS.exists(Path.join(clone, 'deleted.ts'))).toBe(false)
  Tests.expect(await FS.readlink(Path.join(clone, 'linked.ts'))).toBe('source.ts')
  Tests.expect((await FS.lstat(Path.join(clone, 'replaced.ts'))).isFile()).toBe(true)
  Tests.expect(await FS.readFile(Path.join(clone, 'replaced.ts'), 'utf8')).toBe('saved regular contents\n')
  Tests.expect(await git('ls-files', '--stage', '--', 'new file.ts')).toStartWith('100755 ')
  Tests.expect(await git('ls-files', '--stage', '--', 'source.ts')).toStartWith('100755 ')
  Tests.expect(await git('ls-files', '--', '.artifacts')).toBe('')
  const options = { repo: clone, fixture: Path.join(clone, 'source.ts'), samples: 1, edits: 8 }
  await Tests.expect(runMeasurements(options)).rejects.toThrow('Incompatible preview measurement protocol')
  await git('config', '--local', 'core.autocrlf', 'true')
  await FS.writeFile(Path.join(clone, 'source.ts'), 'saved\r\n')
  await git('add', '--', 'source.ts')
  Tests.expect(await git('status', '--porcelain')).toBe('')
  await Tests.expect(runMeasurements(options)).rejects.toThrow('source differs from the captured Git tree')
}

async function receiveWithLineEndingConfiguration(bundle: string, manifest: string, clone: string): Promise<void> {
  const args = [
    'skill-script',
    'agents/skills/performance-investigation/scripts/performance.ts',
    '--',
    'receive',
    '--bundle',
    bundle,
    '--manifest',
    manifest,
    '--directory',
    clone,
  ]
  await CLIKit.runNonInteractiveCommand('./agent', args, {
    cwd: Repo.getWorkspaceRoot(),
    addEnv: {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.autocrlf',
      GIT_CONFIG_VALUE_0: 'true',
    },
  })
}

async function verifyEmbeddedRejection(root: string, git: (...args: string[]) => Promise<string>): Promise<void> {
  const embedded = Path.join(root, 'embedded')
  await FS.mkdir(embedded)
  await git('-C', embedded, 'init', '-b', 'main')
  await FS.writeFile(Path.join(embedded, 'inside.ts'), 'committed\n')
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
  await FS.writeFile(Path.join(embedded, 'inside.ts'), 'saved\n')
  await Tests.expect(createSnapshot(root)).rejects.toThrow('undeclared embedded Git repository')
}
