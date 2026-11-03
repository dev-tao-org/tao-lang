import * as Tests from '@shared-tests'
import { FS, Path } from '@shared/os'
import { Processes } from '@shared/os'
import * as WorkspaceTests from '@workspace-tests'

Tests.test('standalone local consumer commands render compiled Tao views in a real browser', async () => {
  const directory = await WorkspaceTests.createStandaloneLibraryFixture()
  const child = Processes.spawnPiped('just test', { cwd: directory, addEnv: createRefreshEnvironment() })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Processes.readText(child.stdout),
    Processes.readText(child.stderr),
  ])
  Tests.expect({ status, stderr }).toMatchObject({ status: 0 })
  const output = stdout
  Tests.expect(output).toContain('.tao/cache/libraries/Demo')
  Tests.expect(FS.existsSync(Path.join(directory, 'src/.tao'))).toBe(false)
}, 90_000)

function createRefreshEnvironment() {
  return { TAO_TEST_SOURCE_REFRESH: '1' }
}
