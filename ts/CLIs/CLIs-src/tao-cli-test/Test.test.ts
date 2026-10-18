import { Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { findTaoTestFiles } from '../dev-cli/testing/TaoTests'

Tests.test('Tao app discovery includes developer apps and excludes files without tests', async () => {
  const paths = await findTaoTestFiles(Repo.resolvePath('Apps'))
  Tests.expect(paths.map(path => Path.relative(Repo.getWorkspaceRoot(), path))).toEqual([
    'Apps/Dev/Kitchen Sink/Kitchen Sink.tao',
    'Apps/Tests/Interactions.tao',
    'Apps/Tests/Modules/Modules.tao',
    'Apps/Tests/Scopes.tao',
  ])
})

Tests.test('tao test resolves default folders and relative files from the caller and reports failure', async () => {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'), { recursive: true })
  const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/tao cli-'))
  await Try(async () => {
    await FileSystem.writeFile(
      Path.join(directory, 'Journey.tao'),
      'tests { test { run Missing expect text "Never" } }',
    )
    for (const args of [[], ['Journey.tao']]) {
      const child = Platform.spawn(Repo.resolvePath('tao'), {
        variadicArgs: ['test', ...args],
        cwd: directory,
        env: { ...Env.snapshot(), TAO_CLI_CWD: undefined },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        Platform.readText(child.stdout),
        Platform.readText(child.stderr),
      ])
      Tests.expect(status).toBe(1)
      Tests.expect(stdout).toContain('Unknown Tao app: Missing.')
      Tests.expect(stdout).toContain('Tao tests (headless web): 0 passed, 1 failed.')
      Tests.expect(stderr).toContain('Tao app tests failed.')
    }
  }, { finally: () => FileSystem.rm(directory, { recursive: true, force: true }) })
}, 30_000)
