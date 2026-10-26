import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { prepareRuntime } from '../../../CLIs/CLIs-src/cli-checks/runtime-build'
import { prepareToolchain } from '../../runtime-src/expo/Toolchain'

Tests.test(
  'packaged Expo runtime installs frozen dependencies with relocated patches',
  async () => {
    const resources = await prepareRuntime()
    const cache = Artifacts.resolvePath('cache/runtime-toolchain-acceptance', Platform.randomUUID())
    await Try(async () => {
      const nodeModules = await prepareToolchain(cache, resources)
      const packageDirectory = Path.dirname(nodeModules)
      await verifyPatchCopies(resources, packageDirectory)
      await verifyInstalledPatchEffects(nodeModules)
    }, { finally: () => FileSystem.rm(cache, { recursive: true, force: true }) })
  },
  180_000,
)

async function verifyPatchCopies(resources: string, packageDirectory: string): Promise<void> {
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(resources, 'package.json'), 'utf8')) as {
    patchedDependencies: Record<string, string>
  }
  const patchPaths = Object.values(manifest.patchedDependencies).sort()
  Tests.expect(patchPaths).toEqual([
    'patches/@expo%2Fcli@57.0.31.patch',
    'patches/@expo%2Fmetro-file-map@57.0.4.patch',
    'patches/metro@0.84.5.patch',
  ])
  for (const patchPath of patchPaths) {
    const resourcePath = Path.join(resources, patchPath)
    const packagePath = Path.join(packageDirectory, patchPath)
    Tests.expect(await FileSystem.exists(resourcePath)).toBe(true)
    Tests.expect(await FileSystem.readFile(packagePath, 'utf8')).toBe(await FileSystem.readFile(resourcePath, 'utf8'))
  }
}

async function verifyInstalledPatchEffects(nodeModules: string): Promise<void> {
  const fileMapPath = Path.join(nodeModules, '@expo/metro-file-map/build/index.js')
  const metroPath = Path.join(nodeModules, 'metro/src/HmrServer.js')
  const expoCliPath = Path.join(nodeModules, '@expo/cli/build/metro-require/require.js')
  for (const installedPath of [fileMapPath, metroPath, expoCliPath]) {
    Tests.expect(await FileSystem.exists(installedPath)).toBe(true)
  }
  const [fileMap, metro, expoCli] = await Promise.all([
    FileSystem.readFile(fileMapPath, 'utf8'),
    FileSystem.readFile(metroPath, 'utf8'),
    FileSystem.readFile(expoCliPath, 'utf8'),
  ])
  Tests.expect(fileMap).toContain('applyExternalBatch(changes)')
  Tests.expect(metro).toContain('latestChangeEvent,\n          );\n        },\n        0,')
  Tests.expect(expoCli).toMatch(/Refresh\.performReactRefresh\(\);\s+}, 0\);/)
  Tests.expect(await FileSystem.exists(Path.join(nodeModules, 'expo/package.json'))).toBe(true)
}
