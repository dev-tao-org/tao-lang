import { FileSystem, Path, Platform, Tests } from '@shared/os'
import { createStandaloneLibraryFixture } from '../../0-workspace/workspace-test/StandaloneLibrary'

Tests.test('standalone local consumer commands render compiled Tao views in a real browser', async () => {
  const directory = await createStandaloneLibraryFixture()
  const child = Platform.spawnPiped('just test', { cwd: directory, addEnv: createRefreshEnvironment() })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  Tests.expect({ status, stderr }).toMatchObject({ status: 0 })
  const output = stdout
  Tests.expect(output).toContain('.tao/cache/libraries/Demo')
  Tests.expect(FileSystem.existsSync(Path.join(directory, 'src/.tao'))).toBe(false)
}, 90_000)

function createRefreshEnvironment() {
  return { TAO_TEST_SOURCE_REFRESH: '1' }
}
