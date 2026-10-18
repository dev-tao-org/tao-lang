import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { createExpoSession, type ExpoOptions, type ExpoSession } from './expo/Expo'
import { writeExpoApplication } from './expo/Scaffold'
import { prepareToolchain, type RuntimeInstaller } from './expo/Toolchain'

/** create prepares an Expo application from the compiled runtime resources. */
export async function create(options: RuntimeCreateOptions): Promise<RuntimeApplication> {
  const directory = Path.resolve(options.directory)
  const resourcesPath = Path.resolve(options.resourcesDirectory ?? defaultResourcesDirectory())
  const resourcesDirectory = FileSystem.realpathSync(resourcesPath)
  const resources = await readRuntimeResources(resourcesDirectory)
  const cacheDirectory = Path.resolve(options.toolchainCacheDirectory ?? defaultToolchainCacheDirectory())
  await FileSystem.mkdir(directory, { recursive: true })
  await writeExpoApplication(directory, resourcesDirectory, resources.dependencies)
  const dependencyDirectory = await prepareToolchain(cacheDirectory, resourcesDirectory, options.install)
  return await applicationWithToolchain(directory, dependencyDirectory)
}

/** start starts the prepared Expo application and waits for its first response. */
export async function start(application: RuntimeApplication, options?: ExpoOptions): Promise<ExpoSession> {
  return await createExpoSession(application, options)
}

/** RuntimeApplication identifies the generated Expo runtime directory and compiled Tao app entry. */
export type RuntimeApplication = { directory: string; appPath: string }

/** RuntimeCreateOptions selects generated resources and an isolated dependency cache. */
export type RuntimeCreateOptions = {
  directory: string
  resourcesDirectory?: string
  toolchainCacheDirectory?: string
  install?: RuntimeInstaller
}

export type { ExpoOptions, ExpoSession } from './expo/Expo'

type RuntimeResources = { identity: string; dependencies: Record<string, string> }
type RuntimeMetadata = RuntimeResources & { version: 1 }

async function readRuntimeResources(directory: string): Promise<RuntimeResources> {
  const metadataPath = Path.join(directory, 'runtime.json')
  const metadata = await Try(
    async () => JSON.parse(await FileSystem.readFile(metadataPath, 'utf8')) as unknown,
    {
      catch(error) {
        Errors.ThrowUserInput(`Compiled runtime resources are unavailable: ${metadataPath}`, { cause: error })
      },
    },
  )
  if (!isRuntimeMetadata(metadata)) {
    Errors.ThrowUserInput(`Compiled runtime metadata is invalid: ${metadataPath}`)
  }
  for (const file of ['package.json', 'bun.lock', 'TR.js', 'HMRClient.js']) {
    if (!await FileSystem.exists(Path.join(directory, file))) {
      Errors.ThrowUserInput(`Compiled runtime resource is missing: ${Path.join(directory, file)}`)
    }
  }
  return { identity: metadata.identity, dependencies: metadata.dependencies }
}

function isRuntimeMetadata(value: unknown): value is RuntimeMetadata {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const metadata = value as Partial<RuntimeMetadata>
  return metadata.version === 1 && isSafeIdentity(metadata.identity) && isDependencies(metadata.dependencies)
}

function isSafeIdentity(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..'
}

function isDependencies(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null
    && Object.values(value).every(dependency => typeof dependency === 'string')
}

async function applicationWithToolchain(
  directory: string,
  dependencyDirectory: string,
): Promise<RuntimeApplication> {
  const link = Path.join(directory, 'node_modules')
  const currentLink = await Try.WithDefault(undefined, () => FileSystem.lstatSync(link))
  if (!currentLink) {
    await FileSystem.symlink(dependencyDirectory, link, 'dir')
    return runtimeApplication(directory)
  }
  if (!currentLink.isSymbolicLink()) {
    Errors.ThrowUserInput(`Generated Expo dependency path points elsewhere: ${link}`)
  }
  const existingPath = await Try.WithDefault(undefined, () => FileSystem.realpathSync(link))
  if (existingPath === FileSystem.realpathSync(dependencyDirectory)) {
    return runtimeApplication(directory)
  }
  await retargetSymlink(directory, link, dependencyDirectory)
  return runtimeApplication(directory)
}

async function retargetSymlink(directory: string, link: string, target: string): Promise<void> {
  const pendingLink = Path.join(directory, `.node_modules-${Platform.randomUUID()}`)
  await FileSystem.symlink(target, pendingLink, 'dir')
  await Try(() => FileSystem.renameSync(pendingLink, link), {
    finally() {
      return FileSystem.rm(pendingLink, { force: true })
    },
  })
}

function runtimeApplication(directory: string): RuntimeApplication {
  return { directory, appPath: Path.join(directory, 'src/App.tsx') }
}

function defaultResourcesDirectory(): string {
  return Path.resolve(Path.dirname(Path.fileURLToPath(import.meta.url)), '../_gen_runtime')
}

function defaultToolchainCacheDirectory(): string {
  return Path.join(Platform.homeDirectory(), '.tao/toolchains')
}
