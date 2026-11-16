import { Json } from '@shared'
import { Errors, Regxs, Try } from '@shared'
import { FS, Path, Storage } from '@shared/os'
import * as ExpoHost from '../expo/Expo/Expo'
import type { GeneratedRevision, PublicationOutcome } from '../expo/PreviewProtocol'
import * as RuntimeDependencyPolicy from '../expo/RuntimeDependencyPolicy'
export { resolveRuntimeSingletonPackages } from '../expo/RuntimeDependencyPolicy'
import { writeExpoApplication } from '../expo/Scaffold'
import { findPreparedToolchain, prepareToolchain, type RuntimeInstaller } from '../expo/Toolchain'

/** RuntimePackageVersions maps package names to their pinned install specifications. */
export type RuntimePackageVersions = Record<string, string>

type RuntimePreparationOption = 'resourcesDirectory' | 'toolchainCacheDirectory' | 'install' | 'onProgress'
/** prepareRuntime installs the pinned bundled runtime toolchain into the supplied cache. */
export async function prepareRuntime(
  options: Pick<RuntimeCreateOptions, RuntimePreparationOption> = {},
): Promise<string> {
  const resources = Path.resolve(options.resourcesDirectory ?? defaultResourcesDirectory())
  return await prepareToolchain(
    Path.resolve(options.toolchainCacheDirectory ?? defaultToolchainCacheDirectory()),
    resources,
    options.install,
    options.onProgress,
  )
}

type RuntimeCacheOption = 'resourcesDirectory' | 'toolchainCacheDirectory'
/** preparedRuntime returns the bundled runtime toolchain only when it is already cached. */
export async function preparedRuntime(
  options: Pick<RuntimeCreateOptions, RuntimeCacheOption> = {},
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
  const resourcesDirectory = FS.realpathSync(resourcesPath)
  const resources = await readRuntimeResources(resourcesDirectory)
  options.onProgress?.('Runtime resources ready.')
  const cacheDirectory = Path.resolve(options.toolchainCacheDirectory ?? defaultToolchainCacheDirectory())
  await FS.mkdir(directory)
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
    {
      watchFolders: options.watchFolders,
      singletonPackages: options.singletonPackages,
      dependencyDirectory,
      platform: options.platform,
    },
  )
  options.onProgress?.('Expo runtime application scaffolded.')
  const application = runtimeApplication(directory)
  return attachMetroPreload(application, resourcesDirectory)
}

/** start starts the prepared Expo application and waits for its first response. */
export async function start(
  application: RuntimeApplication,
  options?: ExpoHost.ExpoOptions,
  onProgress?: (message: string) => void,
): Promise<ExpoHost.ExpoSession> {
  onProgress?.('Starting Expo server and waiting for readiness…')
  const initial = application.generated ?? {
    revision: 'initial',
    sequence: 0,
    files: { 'App.tsx': await FS.readFile(application.appPath, 'utf8') },
  }
  const expoOptions = createGeneratedExpoOptions(application, initial, options)
  const pending = ExpoHost.createExpoSession(application, expoOptions)
  application.publishGenerated = async revision => (await pending).publish(revision)
  const session = await pending
  onProgress?.('Expo server is ready.')
  return session
}

/** RuntimeApplication identifies the generated Expo runtime directory and compiled Tao app entry. */
export type RuntimeApplication = {
  directory: string
  appPath: string
  metroPreloadPath?: string
  generated?: GeneratedRevision
  publicationSequence?: number
  publishGenerated?(revision: GeneratedRevision): Promise<PublicationOutcome>
}

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
  platform?: ExpoHost.ExpoPlatform
}

export type { ExpoOptions, ExpoPlatform, ExpoSession } from '../expo/Expo/Expo'
export type { RuntimeInstaller } from '../expo/Toolchain'

/** runtimeTypeScriptPaths resolves authored API aliases to the immutable packaged runtime sources. */
export function runtimeTypeScriptPaths(): Record<string, string[]> {
  const resourceDirectory = Path.resolve(FS.realpathSync(defaultResourcesDirectory()))
  const apiPath = Path.join(resourceDirectory, 'runtime/TaoRuntimeAPI.ts')
  const sharedPath = Path.join(resourceDirectory, 'shared/shared.ts')
  for (const path of [apiPath, sharedPath]) {
    if (!FS.existsSync(path)) {
      Errors.ThrowUserInput(`Compiled runtime resource is missing: ${path}`)
    }
  }
  const runtimeClientPath = Path.join(resourceDirectory, 'runtime/*')
  return { '@runtime/client/*': [runtimeClientPath], '@tao/runtime-api': [apiPath], '@shared': [sharedPath] }
}

/** runtimeDependencies returns centrally pinned packages for the managed app and sidecar contracts. */
export function runtimeDependencies(): Promise<RuntimePackageVersions> {
  return pinnedDependencies ??= readPinnedDependencies()
}

/** runtimeDependencyPolicy supplies exact Metro patches for independently installed project dependencies. */
export function runtimeDependencyPolicy(): Promise<RuntimeDependencyPolicy.RuntimeDependencyPolicy> {
  return RuntimeDependencyPolicy.readRuntimeDependencyPolicy(defaultResourcesDirectory())
}

let pinnedDependencies: OptionalPinnedDependencies

function attachMetroPreload(application: RuntimeApplication, resourcesDirectory: string): RuntimeApplication {
  const metroPreloadPath = Path.join(resourcesDirectory, 'metro/MetroPreload.cjs')
  return { ...application, metroPreloadPath }
}

type OptionalExpoOptions = ExpoHost.ExpoOptions | undefined
function createGeneratedExpoOptions(
  application: RuntimeApplication,
  initial: GeneratedRevision,
  options: OptionalExpoOptions,
): ExpoHost.ExpoOptions {
  return { ...options, generated: { initial, preloadPath: application.metroPreloadPath } }
}

async function readPinnedDependencies(): Promise<RuntimePackageVersions> {
  const directory = defaultResourcesDirectory()
  const resources = await readRuntimeResources(directory)
  const lock = RuntimeDependencyPolicy.parseRuntimeDependencyLock(
    await FS.readFile(Path.join(directory, 'bun.lock'), 'utf8'),
    Path.join(directory, 'bun.lock'),
  )
  const types = lock.packages['@types/react']?.[0].slice('@types/react@'.length)
  if (types === undefined) {
    Errors.ThrowShouldNeverHappen('The runtime lock does not pin React contract types.')
  }
  return { ...resources.dependencies, '@types/react': types }
}

type RuntimeResources = {
  identity: string
  dependencies: RuntimePackageVersions
  devDependencies: RuntimePackageVersions
  sourceFiles: string[]
}

type OptionalPinnedDependencies = Promise<RuntimePackageVersions> | undefined

type RuntimeMetadata = Omit<RuntimeResources, 'devDependencies'> & {
  version: 2
  devDependencies?: RuntimePackageVersions
}
async function readRuntimeResources(directory: string): Promise<RuntimeResources> {
  const metadataPath = Path.join(directory, 'runtime.json')
  const metadata = await Try(
    async () => parseRuntimeMetadata(await FS.readFile(metadataPath, 'utf8')),
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
    if (!await FS.exists(Path.join(directory, file))) {
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

function parseRuntimeMetadata(contents: string): unknown {
  return Json.Parse(contents)
}

function isRuntimeMetadata(value: unknown): value is RuntimeMetadata {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const metadata = value as Partial<RuntimeMetadata>
  return hasValidMetadataIdentity(metadata) && hasValidDependencyMetadata(metadata)
    && isSourceFiles(metadata.sourceFiles)
}

function hasValidMetadataIdentity(metadata: Partial<RuntimeMetadata>): boolean {
  return hasSupportedMetadataVersion(metadata) && isSafeIdentity(metadata.identity)
}

function hasSupportedMetadataVersion(metadata: Partial<RuntimeMetadata>): boolean {
  return metadata.version === 2
}

function hasValidDependencyMetadata(metadata: Partial<RuntimeMetadata>): boolean {
  if (!isDependencies(metadata.dependencies)) {
    return false
  }
  return metadata.devDependencies === undefined || isDependencies(metadata.devDependencies)
}

function isSourceFiles(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isSafeSourcePath)
}

function isSafeSourcePath(file: unknown): file is string {
  if (!isValidSourcePathText(file)) {
    return false
  }
  return !file.split('/').some(isUnsafeSourcePathSegment)
}

function isValidSourcePathText(file: unknown): file is string {
  return typeof file === 'string' && isNonemptyRelativeSourcePath(file)
}

function isNonemptyRelativeSourcePath(file: string): boolean {
  return file.length > 0 && !file.startsWith('/') && !file.includes('\\')
}

function isUnsafeSourcePathSegment(segment: string): boolean {
  return segment === '.' || segment === '..'
}

function isSafeIdentity(value: unknown): value is string {
  return typeof value === 'string' && isValidIdentity(value)
}

function isValidIdentity(value: string): boolean {
  return isAllowedIdentity(value) && isNonTraversalIdentity(value)
}

function isAllowedIdentity(value: string): boolean {
  return Regxs.RuntimeNameRegx.test(value)
}

function isNonTraversalIdentity(value: string): boolean {
  return !isTraversalIdentity(value)
}

function isTraversalIdentity(value: string): boolean {
  return value === '.' || value === '..'
}

function isDependencies(value: unknown): value is RuntimePackageVersions {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Object.values(value).every(isStringDependency)
}

function isStringDependency(value: unknown): value is string {
  return typeof value === 'string'
}

function runtimeApplication(directory: string): RuntimeApplication {
  return { directory, appPath: Path.join(directory, 'src/App.tsx') }
}

function defaultResourcesDirectory(): string {
  return Path.resolve(Path.dirname(Path.fileURLToPath(import.meta.url)), '../../_gen_runtime')
}

function defaultToolchainCacheDirectory(): string {
  return Storage.resolveCacheDirectory('toolchains')
}
