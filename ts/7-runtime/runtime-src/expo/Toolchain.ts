import { Try } from '@shared'
import { BuildLock, FileSystem, Path, Platform } from '@shared/os'

/** prepareToolchain installs pinned Expo dependencies once for this resource manifest and platform. */
export async function prepareToolchain(
  cacheDirectory: string,
  resourcesDirectory: string,
  installer: RuntimeInstaller = managedInstaller,
  onProgress?: (message: string) => void,
): Promise<string> {
  onProgress?.('Resolving runtime toolchain cache identity…')
  const toolchainKey = await toolchainIdentity(resourcesDirectory)
  const target = Path.join(cacheDirectory, toolchainKey)
  await BuildLock.withBuildLock(Path.join(cacheDirectory, `${toolchainKey}.lock`), async () => {
    await FileSystem.mkdir(target, { recursive: true })
    await FileSystem.writeIfChanged(
      Path.join(target, 'package.json'),
      await FileSystem.readFile(Path.join(resourcesDirectory, 'package.json'), 'utf8'),
    )
    await FileSystem.writeIfChanged(
      Path.join(target, 'bun.lock'),
      await FileSystem.readFile(Path.join(resourcesDirectory, 'bun.lock'), 'utf8'),
    )
    const readyPath = Path.join(target, '.ready')
    const ready = await Try.WithDefault(undefined, () => FileSystem.readFile(readyPath, 'utf8'))
    const hasDependencies = await FileSystem.exists(Path.join(target, 'node_modules'))
    if (ready === toolchainKey && hasDependencies) {
      onProgress?.('Runtime toolchain cache hit.')
    } else {
      onProgress?.('Installing cached Expo runtime dependencies…')
      await installer.install(target)
      await FileSystem.writeFile(readyPath, toolchainKey)
      onProgress?.('Expo runtime dependencies installed.')
    }
  })
  return Path.join(target, 'node_modules')
}

/** RuntimeInstaller installs managed dependencies into a versioned toolchain directory. */
export type RuntimeInstaller = { install(cacheDirectory: string): Promise<void> }

const managedInstaller: RuntimeInstaller = {
  async install(cacheDirectory) {
    await Platform.capture('bun install --frozen-lockfile --ignore-scripts', { cwd: cacheDirectory })
  },
}

async function toolchainIdentity(resourcesDirectory: string): Promise<string> {
  const [manifest, lockfile] = await Promise.all([
    FileSystem.readFile(Path.join(resourcesDirectory, 'package.json'), 'utf8'),
    FileSystem.readFile(Path.join(resourcesDirectory, 'bun.lock'), 'utf8'),
  ])
  const platform = Platform.systemInfo()
  return Platform.hashText(`${manifest}\0${lockfile}\0${platform.os}\0${platform.architecture}`)
}
