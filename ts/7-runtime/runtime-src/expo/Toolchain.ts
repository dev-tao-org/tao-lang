import { Try } from '@shared'
import { BuildLock, FS, Path, Platform, Storage } from '@shared/os'
import Exec from '@shared/os/exec'
import { readRuntimePatches } from './RuntimePatches'
import * as ToolchainIdentity from './ToolchainIdentity'

/** prepareToolchain installs pinned Expo dependencies once for this resource manifest and platform. */
export async function prepareToolchain(
  cacheDirectory: string,
  resourcesDirectory: string,
  installer: RuntimeInstaller = managedInstaller,
  onProgress?: (message: string) => void,
): Promise<string> {
  onProgress?.('Resolving runtime toolchain cache identity…')
  const toolchainKey = await resolveToolchainKey(resourcesDirectory)
  const target = Path.join(cacheDirectory, toolchainKey)
  await BuildLock.withBuildLock(Path.join(cacheDirectory, `${toolchainKey}.lock`), async () => {
    await FS.mkdir(target)
    await FS.writeIfChanged(
      Path.join(target, 'package.json'),
      await FS.readFile(Path.join(resourcesDirectory, 'package.json'), 'utf8'),
    )
    await FS.writeIfChanged(
      Path.join(target, 'bun.lock'),
      await FS.readFile(Path.join(resourcesDirectory, 'bun.lock'), 'utf8'),
    )
    await copyToolchainPatches(resourcesDirectory, target)
    const readyPath = Path.join(target, '.ready')
    const ready = await Try.WithDefault(undefined, () => FS.readFile(readyPath, 'utf8'))
    const hasDependencies = await FS.exists(Path.join(target, 'node_modules'))
    if (ready === toolchainKey && hasDependencies) {
      onProgress?.('Runtime toolchain cache hit.')
    } else {
      onProgress?.('Installing cached Expo runtime dependencies…')
      await installer.install(target)
      await FS.writeFile(readyPath, toolchainKey)
      onProgress?.('Expo runtime dependencies installed.')
    }
  })
  return Path.join(target, 'node_modules')
}

/** findPreparedToolchain returns the pinned runtime toolchain only when its cache is complete. */
export async function findPreparedToolchain(
  cacheDirectory: string,
  resourcesDirectory: string,
): Promise<string | undefined> {
  const key = await resolveToolchainKey(resourcesDirectory)
  const target = Path.join(cacheDirectory, key)
  const ready = await Try.WithDefault(undefined, () => FS.readFile(Path.join(target, '.ready'), 'utf8'))
  return ready === key && await FS.exists(Path.join(target, 'node_modules'))
    ? Path.join(target, 'node_modules')
    : undefined
}

/** RuntimeInstaller installs managed dependencies into a versioned toolchain directory. */
export type RuntimeInstaller = { install(cacheDirectory: string): Promise<void> }

const managedInstaller: RuntimeInstaller = {
  async install(cacheDirectory) {
    const addEnv = { BUN_INSTALL_CACHE_DIR: Storage.resolveCacheDirectory('bun') }
    await Exec.capture('bun', ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: cacheDirectory, addEnv })
  },
}

async function resolveToolchainKey(resourcesDirectory: string): Promise<string> {
  const identity = await readToolchainIdentity(resourcesDirectory)
  return ToolchainIdentity.calculateToolchainKey(identity)
}

async function readToolchainIdentity(resourcesDirectory: string): Promise<ToolchainIdentity.ToolchainIdentity> {
  const [manifest, lockfile] = await Promise.all([
    FS.readFile(Path.join(resourcesDirectory, 'package.json'), 'utf8'),
    FS.readFile(Path.join(resourcesDirectory, 'bun.lock'), 'utf8'),
  ])
  const platform = Platform.systemInfo()
  const runtimeVersion = Platform.runtimeVersion()
  const { os, architecture } = platform
  const { patches } = await readRuntimePatches(resourcesDirectory)
  return { manifest, lockfile, patches, runtimeVersion, os, architecture }
}

async function copyToolchainPatches(source: string, target: string): Promise<void> {
  const { patches } = await readRuntimePatches(source)
  for (const [path, content] of Object.entries(patches)) {
    const destination = Path.join(target, path)
    await FS.mkdir(Path.dirname(destination))
    await FS.writeIfChanged(destination, content)
  }
}
