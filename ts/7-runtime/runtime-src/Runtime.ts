import { Errors, Try } from '@shared'
import { FileSystem, Path, Storage } from '@shared/os'
import { createExpoSession, type ExpoOptions, type ExpoSession } from './expo/Expo'
import { writeExpoApplication } from './expo/Scaffold'
import { findPreparedToolchain, prepareToolchain, type RuntimeInstaller } from './expo/Toolchain'

/** prepareRuntime installs the pinned bundled runtime toolchain into the supplied cache. */
export async function prepareRuntime(
  options: Pick<RuntimeCreateOptions, 'resourcesDirectory' | 'toolchainCacheDirectory' | 'install' | 'onProgress'> = {},
): Promise<string> {
  const resources = Path.resolve(options.resourcesDirectory ?? defaultResourcesDirectory())
  return await prepareToolchain(
    Path.resolve(options.toolchainCacheDirectory ?? defaultToolchainCacheDirectory()),
    resources,
    options.install,
    options.onProgress,
  )
}

/** preparedRuntime returns the bundled runtime toolchain only when it is already cached. */
export async function preparedRuntime(
  options: Pick<RuntimeCreateOptions, 'resourcesDirectory' | 'toolchainCacheDirectory'> = {},
): Promise<string | undefined> {
  return await findPreparedToolchain(
    Path.resolve(options.toolchainCacheDirectory ?? defaultToolchainCacheDirectory()),
    Path.resolve(options.resourcesDirectory ?? defaultResourcesDirectory()),
  )
}

/** create prepares an Expo application from the compiled runtime resources. */
export async function create(options: RuntimeCreateOptions): Promise<RuntimeApplication> {
  const directory = Path.resolve(options.directory)
  const resourcesPath = Path.resolve(options.resourcesDirectory ?? defaultResourcesDirectory())
  options.onProgress?.('Reading and validating runtime resources…')
  const resourcesDirectory = FileSystem.realpathSync(resourcesPath)
  const resources = await readRuntimeResources(resourcesDirectory)
  options.onProgress?.('Runtime resources ready.')
  const cacheDirectory = Path.resolve(options.toolchainCacheDirectory ?? defaultToolchainCacheDirectory())
  await FileSystem.mkdir(directory, { recursive: true })
  const dependencyDirectory = options.dependencyDirectory ?? await prepareToolchain(
    cacheDirectory,
    resourcesDirectory,
    options.install,
    options.onProgress,
  )
  options.onProgress?.('Scaffolding Expo runtime application…')
  await writeExpoApplication(
    directory,
    resourcesDirectory,
    resources.dependencies,
    resources.devDependencies,
    resources.sourceFiles,
    { watchFolders: options.watchFolders, singletonPackages: options.singletonPackages },
  )
  options.onProgress?.('Expo runtime application scaffolded.')
  return await applicationWithToolchain(directory, dependencyDirectory)
}

/** start starts the prepared Expo application and waits for its first response. */
export async function start(
  application: RuntimeApplication,
  options?: ExpoOptions,
  onProgress?: (message: string) => void,
): Promise<ExpoSession> {
  onProgress?.('Starting Expo server and waiting for readiness…')
  const session = await createExpoSession(application, options)
  onProgress?.('Expo server is ready.')
  return session
}

/** RuntimeApplication identifies the generated Expo runtime directory and compiled Tao app entry. */
export type RuntimeApplication = { directory: string; appPath: string }

/** RuntimeCreateOptions selects generated resources and an isolated dependency cache. */
export type RuntimeCreateOptions = {
  directory: string
  resourcesDirectory?: string
  toolchainCacheDirectory?: string
  install?: RuntimeInstaller
  onProgress?: (message: string) => void
  dependencyDirectory?: string
  watchFolders?: readonly string[]
  singletonPackages?: readonly string[]
}

export type { ExpoOptions, ExpoSession } from './expo/Expo'
export type { RuntimeInstaller } from './expo/Toolchain'

/** runtimeDependencies returns centrally pinned packages for the managed app and sidecar contracts. */
export function runtimeDependencies(): Promise<Record<string, string>> {
  return pinnedDependencies ??= readPinnedDependencies()
}

let pinnedDependencies: Promise<Record<string, string>> | undefined

async function readPinnedDependencies(): Promise<Record<string, string>> {
  const directory = defaultResourcesDirectory()
  const resources = await readRuntimeResources(directory)
  const lock = JSON.parse(await FileSystem.readFile(Path.join(directory, 'bun.lock'), 'utf8')) as {
    packages: Record<string, [string, ...unknown[]]>
  }
  const types = lock.packages['@types/react']?.[0].slice('@types/react@'.length)
    ?? Errors.ThrowShouldNeverHappen('The runtime lock does not pin React contract types.')
  return { ...resources.dependencies, '@types/react': types }
}

type RuntimeResources = {
  identity: string
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  sourceFiles: string[]
}
type RuntimeMetadata = Omit<RuntimeResources, 'devDependencies'> & {
  version: 2
  devDependencies?: Record<string, string>
}

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
  for (const file of ['package.json', 'bun.lock', ...metadata.sourceFiles]) {
    if (!await FileSystem.exists(Path.join(directory, file))) {
      Errors.ThrowUserInput(`Compiled runtime resource is missing: ${Path.join(directory, file)}`)
    }
  }
  return {
    identity: metadata.identity,
    dependencies: metadata.dependencies,
    devDependencies: metadata.devDependencies ?? {},
    sourceFiles: metadata.sourceFiles,
  }
}

function isRuntimeMetadata(value: unknown): value is RuntimeMetadata {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const metadata = value as Partial<RuntimeMetadata>
  return metadata.version === 2 && isSafeIdentity(metadata.identity)
    && isDependencies(metadata.dependencies)
    && (metadata.devDependencies === undefined || isDependencies(metadata.devDependencies))
    && isSourceFiles(metadata.sourceFiles)
}

function isSourceFiles(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isSafeSourcePath)
}

function isSafeSourcePath(file: unknown): file is string {
  return typeof file === 'string' && file.length > 0
    && !file.startsWith('/') && !file.includes('\\')
    && !file.split('/').some(segment => segment === '.' || segment === '..')
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
  await FileSystem.replaceDirectoryLink(dependencyDirectory, link)
  return runtimeApplication(directory)
}

function runtimeApplication(directory: string): RuntimeApplication {
  return { directory, appPath: Path.join(directory, 'src/App.tsx') }
}

function defaultResourcesDirectory(): string {
  return Path.resolve(Path.dirname(Path.fileURLToPath(import.meta.url)), '../_gen_runtime')
}

function defaultToolchainCacheDirectory(): string {
  return Storage.resolveCacheDirectory('toolchains')
}
