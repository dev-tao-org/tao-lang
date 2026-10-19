import { Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { initializeProject } from '@workspace/projects/Projects'

Tests.test('tao fmt and fix resolve source paths from the caller directory', async () => {
  const directory = Artifacts.resolvePath('tmp', `source-cli-${Platform.randomUUID()}`)
  const path = Path.join(directory, 'Example.tao')
  await FileSystem.mkdir(directory, { recursive: true })
  await initializeProject(directory)
  await Try(async () => {
    for (const command of ['fmt', 'fix']) {
      for (const cwd of [Repo.getWorkspaceRoot(), directory]) {
        await FileSystem.writeFile(path, 'view Main{render Missing}')
        const child = Platform.spawn(Repo.resolvePath('tao'), {
          variadicArgs: [command, Path.relative(cwd, path)],
          cwd,
          env: {
            ...Env.snapshot(),
            TAO_CLI_CWD: undefined,
            TAO_CACHE_DIR: Path.join(directory, '.cache-fixture'),
            TAO_SUPPORT_DIR: Path.join(directory, '.support-fixture'),
          },
          stdout: 'pipe',
          stderr: 'pipe',
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
    const child = Platform.spawn(Repo.resolvePath('agent'), {
      variadicArgs: ['test', target],
      cwd: Repo.getWorkspaceRoot(),
      stdout: 'pipe',
      stderr: 'pipe',
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
      'use Text from tao@ui\napp Main { root Greeting }\nview Greeting { render Text("Hi") }',
    )
    const child = Platform.spawn(Repo.resolvePath('tao'), {
      variadicArgs: ['compile', 'Main.tao'],
      cwd: directory,
      env: {
        ...Env.snapshot(),
        TAO_CLI_CWD: undefined,
        TAO_CACHE_DIR: Path.join(directory, '.cache-fixture'),
        TAO_SUPPORT_DIR: Path.join(directory, '.support-fixture'),
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Platform.readText(child.stdout),
      Platform.readText(child.stderr),
    ])
    Tests.expect(status).toBe(1)
    Tests.expect(stdout + stderr).toContain('tao prepare')
    Tests.expect(await FileSystem.exists(Path.join(directory, '.tao/cache/runtime-toolchains'))).toBe(false)
  }, { finally: () => FileSystem.rm(directory, { recursive: true, force: true }) })
}, 30_000)
