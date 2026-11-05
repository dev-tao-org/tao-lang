import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Repo } from '@shared/os'
import { Processes } from '@shared/os'
import * as Workspace from '@workspace'

import { findTaoTestFiles } from '../CLIs-src/dev-cli/testing/TaoTests'

Tests.test('Tao app discovery includes developer apps and excludes files without tests', async () => {
  const paths = await findTaoTestFiles(Repo.resolvePath('Apps'))
  Tests.expect(paths.map(path => Path.relative(Repo.getWorkspaceRoot(), path))).toEqual([
    'Apps/Dev/Kitchen Sink/Kitchen Sink.tao',
    'Apps/Tests/Language/PrivateViews.test.tao',
    'Apps/Tests/Language/Scopes.test.tao',
    'Apps/Tests/Modules and Dependencies/Imports.test.tao',
    'Apps/Tests/UI Interactions/Forms.test.tao',
  ])
})

Tests.test('tao test resolves default folders and relative files from the caller and reports failure', async () => {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'))
  const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/tao cli-'))
  await Try(async () => {
    await Workspace.initializeProject(directory)
    await FS.writeFile(
      Path.join(directory, 'Journey.tao'),
      'tests { test { run Missing expect text "Never" } }',
    )
    const dependencies = await Workspace.createProjectDependencyOptions(directory)
    await Workspace.prepareDependencies(directory, await dependencies.readRequirements(directory), dependencies)
    for (const args of [[], ['Journey.tao']]) {
      const addEnv = {
        TAO_CLI_CWD: undefined,
        TAO_CACHE_DIR: Path.join(directory, '.cache-fixture'),
        TAO_SUPPORT_DIR: Path.join(directory, '.support-fixture'),
      }
      const child = Processes.spawnPiped(Repo.resolvePath('tao'), {
        variadicArgs: ['test', ...args],
        cwd: directory,
        addEnv,
      })
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        Processes.readText(child.stdout),
        Processes.readText(child.stderr),
      ])
      Tests.expect(status).toBe(1)
      Tests.expect(stdout).toContain('Unknown Tao app: Missing.')
      Tests.expect(stdout).toContain('Tao tests (headless web): 0 passed, 1 failed.')
      Tests.expect(stderr).toContain('Tao app tests failed.')
      Tests.expect(stdout + stderr).not.toContain('All tests passed')
    }
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
}, 30_000)
