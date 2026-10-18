import { Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'

Tests.test('tao fmt and fix resolve source paths from the caller directory', async () => {
  const directory = Artifacts.resolvePath('tmp', `source-cli-${Platform.randomUUID()}`)
  const path = Path.join(directory, 'Example.tao')
  await FileSystem.mkdir(directory, { recursive: true })
  await Try(async () => {
    for (const command of ['fmt', 'fix']) {
      for (const cwd of [Repo.getWorkspaceRoot(), directory]) {
        await FileSystem.writeFile(path, 'view Main{render Missing}')
        const child = Platform.spawn(Repo.resolvePath('tao'), {
          variadicArgs: [command, Path.relative(cwd, path)],
          cwd,
          env: { ...Env.snapshot(), TAO_CLI_CWD: undefined },
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
