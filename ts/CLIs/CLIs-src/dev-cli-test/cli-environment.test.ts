import { S, Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'

Tests.test('agent test defaults to terminal output and accepts a slow threshold with a selected path', async () => {
  const child = Platform.spawn(Repo.resolvePath('agent'), {
    variadicArgs: ['test', 'CLIs/CLIs-src/cli-checks-test/slow-tests.test.ts', '--slow', '0', '--parallel', '1'],
    cwd: Repo.getWorkspaceRoot(),
    env: { ...Env.snapshot(), TERMINAL_OUTPUT: undefined },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  Tests.expect(status).toBe(0)
  Tests.expect(stdout + stderr).toContain('Slow tests (>0 ms):')
  Tests.expect(stdout + stderr).toContain('a per-run threshold uses seconds')
  Tests.expect(stdout + stderr).toContain('bun test --parallel=1')
  Tests.expect(stdout + stderr).toMatch(/\[TypeScript tests\] passed in \d+\.\d{2}s/)
  Tests.expect(stdout).toMatch(/\n\t\u001b\[32mAll tests passed in \d+\.\d{2}s\u001b\[0m\n/)
})

Tests.test('fresh setup finds package tools installed after the launcher prepares PATH', async () => {
  await FileSystem.mkdir(Artifacts.resolvePath('tmp'), { recursive: true })
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/cli-environment-'))
  await Try(async () => {
    await FileSystem.mkdir(Path.join(root, 'ts/1-grammar'), { recursive: true })
    await FileSystem.writeFile(Path.join(root, 'ts/1-grammar/package.json'), '{}', 'utf8')
    const tool = Path.join(root, 'fixture-tool')
    await FileSystem.writeFile(tool, '#!/bin/sh\n', 'utf8')
    await FileSystem.chmod(tool, 0o755)
    const path = await Platform.capture('sh', {
      variadicArgs: [
        '-c',
        S`
          DEVENV_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
          export DEVENV_ROOT TAO_DEVENV=1
          . "$1"
          mkdir -p "$repository/ts/1-grammar/node_modules/.bin"
          cp "$2" "$repository/ts/1-grammar/node_modules/.bin/tao-fixture-tool"
          command -v tao-fixture-tool
        `,
        Path.join(root, 'agent'),
        Repo.resolvePath('.config/cli-environment.sh'),
        tool,
      ],
    })
    Tests.expect(path).toBe(Path.join(root, 'ts/1-grammar/node_modules/.bin/tao-fixture-tool'))
  }, {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})
