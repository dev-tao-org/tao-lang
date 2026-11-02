import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { initializeProject } from '@workspace/projects/Projects'

Tests.test('tao fmt and fix resolve source paths from the caller directory', async () => {
  const directory = Artifacts.resolvePath('tmp', `source-cli-${Platform.randomUUID()}`)
  const path = Path.join(directory, 'Example.tao')
  await FileSystem.mkdir(directory)
  await initializeProject(directory)
  await Try(async () => {
    for (const command of ['fmt', 'fix']) {
      for (const cwd of [Repo.getWorkspaceRoot(), directory]) {
        await FileSystem.writeFile(path, 'view Main{render Missing}')
        const addEnv = {
          TAO_CLI_CWD: undefined,
          TAO_CACHE_DIR: Path.join(directory, '.cache-fixture'),
          TAO_SUPPORT_DIR: Path.join(directory, '.support-fixture'),
        }
        const child = Platform.spawnPiped(Repo.resolvePath('tao'), {
          variadicArgs: [command, Path.relative(cwd, path)],
          cwd,
          addEnv,
        })
        const [status, stdout, stderr] = await Promise.all([
          child.exited,
          Platform.readText(child.stdout),
          Platform.readText(child.stderr),
        ])
        Tests.expect({ status, failed: stderr.includes('ENOENT') }).toEqual({ status: 0, failed: false })
        Tests.expect(stdout).toContain(path)
        Tests.expect(await FileSystem.readFile(path, 'utf8')).toBe('view Main {\n  render Missing\n}')
      }
    }
  }, { finally: () => FileSystem.rm(directory, { recursive: true, force: true }) })
})

Tests.test('root agent test rejects legacy and outside Tao targets before compilation', async () => {
  for (
    const [target, message] of [
      ['.x-tao-old-v1/Apps/Missing.tao', 'Run legacy workflows'],
      ['../outside.tao', 'Requested paths must remain inside'],
    ]
  ) {
    const child = Platform.spawnPiped(Repo.resolvePath('agent'), {
      variadicArgs: ['test', target],
      cwd: Repo.getWorkspaceRoot(),
    })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Platform.readText(child.stdout),
      Platform.readText(child.stderr),
    ])
    Tests.expect(status).toBe(1)
    Tests.expect(stdout + stderr).toContain(message)
  }
})

Tests.test('cold project compilation requests preparation without installing runtime packages', async () => {
  const directory = Artifacts.resolvePath('tmp', `cold-cli-${Platform.randomUUID()}`)
  await initializeProject(directory)
  await Try(async () => {
    await FileSystem.writeFile(
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
    const child = Platform.spawnPiped(Repo.resolvePath('tao'), {
      variadicArgs: ['compile', 'Main.tao'],
      cwd: directory,
      addEnv,
      stdin: 'ignore',
    })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Platform.readText(child.stdout),
      Platform.readText(child.stderr),
    ])
    Tests.expect(status).toBe(1)
    Tests.expect(stdout + stderr).toContain('tao setup')
    Tests.expect(await FileSystem.exists(Path.join(directory, '.tao/cache/runtime-toolchains'))).toBe(false)
  }, { finally: () => FileSystem.rm(directory, { recursive: true, force: true }) })
}, 30_000)
