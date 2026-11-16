import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import * as Workspace from '@workspace'

Tests.test('tao fmt and fix resolve source paths from the caller directory', async () => {
  const directory = Artifacts.resolvePath('tmp', `source-cli-${Platform.randomUUID()}`)
  const path = Path.join(directory, 'Example.tao')
  await FS.mkdir(directory)
  await Workspace.initializeProject(directory)
  await Try(async () => {
    for (const command of ['fmt', 'fix']) {
      for (const cwd of [Repo.getWorkspaceRoot(), directory]) {
        await FS.writeFile(path, 'view Main{render Missing}')
        const addEnv = {
          TAO_CLI_CWD: undefined,
          TAO_CACHE_DIR: Path.join(directory, '.cache-fixture'),
          TAO_SUPPORT_DIR: Path.join(directory, '.support-fixture'),
        }
        const child = Exec.spawn(Repo.resolvePath('tao'), [command, Path.relative(cwd, path)], { cwd, addEnv })
        const [status, stdout, stderr] = await Promise.all([
          child.exited,
          Exec.readText(child.stdout),
          Exec.readText(child.stderr),
        ])
        Tests.expect({ status, failed: stderr.includes('ENOENT') }).toEqual({ status: 0, failed: false })
        Tests.expect(stdout).toContain(path)
        Tests.expect(await FS.readFile(path, 'utf8')).toBe('view Main {\n  render Missing\n}')
      }
    }
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

Tests.test('root agent test rejects legacy and outside Tao targets before compilation', async () => {
  for (
    const [target, message] of [
      ['.x-tao-old-v1/Apps/Missing.tao', 'Run legacy workflows'],
      ['../outside.tao', 'Requested paths must remain inside'],
    ]
  ) {
    const child = Exec.spawn(Repo.resolvePath('agent'), ['test', target], { cwd: Repo.getWorkspaceRoot() })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Exec.readText(child.stdout),
      Exec.readText(child.stderr),
    ])
    Tests.expect(status).toBe(1)
    Tests.expect(stdout + stderr).toContain(message)
  }
})

Tests.test('cold project compilation requests preparation without installing runtime packages', async () => {
  const directory = Artifacts.resolvePath('tmp', `cold-cli-${Platform.randomUUID()}`)
  await Workspace.initializeProject(directory)
  await Try(async () => {
    await FS.writeFile(
      Path.join(directory, 'Main.tao'),
      S`
        use tao@ui Text
        app Main { root Greeting }
        view Greeting { render Text("Hi") }
      `,
    )
    const addEnv = {
      TAO_CLI_CWD: undefined,
      TAO_CACHE_DIR: Path.join(directory, '.cache-fixture'),
      TAO_SUPPORT_DIR: Path.join(directory, '.support-fixture'),
    }
    const child = Exec.spawn(Repo.resolvePath('tao'), ['compile', 'Main.tao'], {
      cwd: directory,
      addEnv,
      stdin: 'ignore',
    })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Exec.readText(child.stdout),
      Exec.readText(child.stderr),
    ])
    Tests.expect(status).toBe(1)
    Tests.expect(stdout + stderr).toContain('tao setup')
    Tests.expect(await FS.exists(Path.join(directory, '.tao/cache/runtime-toolchains'))).toBe(false)
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
}, 30_000)
