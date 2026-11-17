import { Json, Schema } from '@shared'
import { Try, UserInput } from '@shared'
import { Files, FS, Path, Platform, Storage } from '@shared/os'
import Exec from '@shared/os/exec'
import { satisfies, validRange } from './bridges/Bridge_semver'
import { isNpmPackageName } from './NpmPackageName'
import type { TypeScriptProjectPackage } from './TypeScriptProjectPackage'
import type { WorkflowUI } from './Workflow'

/** prepareConsumerDependencies installs the authored package only when its local dependency state needs setup. */
export async function prepareConsumerDependencies(
  manifest: TypeScriptProjectPackage,
  ui: WorkflowUI,
): Promise<void> {
  const { directory } = manifest
  const release = await Storage.acquireCacheLease(`consumer-dependencies:${FS.realpathSync(directory)}`)
  await Try(() => prepareInstalledConsumer(manifest, ui), { finally: release })
}

/** linkConsumerBuildDependencies makes authored dependencies available to a local generated library. */
export async function linkConsumerBuildDependencies(directory: string, libraryOutput: string): Promise<void> {
  const modules = Path.join(directory, 'node_modules')
  if (FS.existsSync(modules)) {
    await FS.replaceDirectoryLink(modules, Path.join(libraryOutput, 'node_modules'))
  }
}

type ConsumerPackages = TypeScriptProjectPackage['dependencies']
type ConsumerInstallState = { fingerprint: string; localSources: ConsumerPackages }
type PreviousConsumerInstall = ConsumerInstallState | undefined
const InstallReceipt = '.tao-consumer-install'

async function prepareInstalledConsumer(manifest: TypeScriptProjectPackage, ui: WorkflowUI): Promise<void> {
  const { directory } = manifest
  const packages = { ...manifest.dependencies, ...manifest.devDependencies }
  const names = Object.keys(packages)
  if (!names.length) {
    return
  }
  const receiptPath = Path.join(directory, 'node_modules', InstallReceipt)
  const receipt = await readInstallReceipt(receiptPath)
  const current = await readInstallState(directory, packages)
  const hasPackages = names.every(name => hasInstalledPackage(directory, name))
  const recorded = receipt === undefined
    ? await matchesUnrecordedInstall(directory, packages, hasPackages)
    : receipt.fingerprint === current.fingerprint
  if (!hasPackages || !recorded) {
    await confirmConsumerInstall(directory, ui)
    const hasLock = FS.existsSync(Path.join(directory, 'bun.lock'))
    await installConsumerDependencies(manifest, hasPackages ? ['--force'] : [])
    if (hasLock) {
      await updateLocalDependencyGraph(directory, current, receipt)
    }
    UserInput.require(
      names.every(name => hasInstalledPackage(directory, name)),
      `The install did not prepare all declared packages in ${directory}.`,
    )
  } else {
    await refreshLocalPackages(manifest, packages, ui)
  }
  await FS.writeIfChanged(receiptPath, Json.Canonical(await readInstallState(directory, packages)))
}

async function confirmConsumerInstall(directory: string, ui: WorkflowUI): Promise<void> {
  const message = `The TypeScript consumer at ${directory} needs dependency setup.`
  UserInput.require(await ui.confirm({ entry: directory, message, consumer: true }), 'Dependency setup was declined.')
  UserInput.require(!ui.cancelled?.(), 'Workflow cancelled.')
}

function hasInstalledPackage(directory: string, name: string): boolean {
  UserInput.require(isNpmPackageName(name), `Invalid consumer dependency name: ${name}`)
  return FS.existsSync(Path.join(directory, 'node_modules', name, 'package.json'))
}

async function matchesUnrecordedInstall(directory: string, packages: ConsumerPackages, hasPackages: boolean) {
  if (!hasPackages || FS.existsSync(Path.join(directory, 'bun.lock'))) {
    return false
  }
  for (const [name, specification] of Object.entries(packages)) {
    const installed = Path.join(directory, 'node_modules', name)
    if (!await matchesInstalledPackage(directory, name, specification, installed)) {
      return false
    }
  }
  return true
}

async function matchesInstalledPackage(
  directory: string,
  name: string,
  specification: string,
  installed: string,
): Promise<boolean> {
  const source = resolveLocalSource(directory, specification)
  if (source) {
    return isDirectory(source) && !await hasChangedLocalDirectory(source, installed)
  }
  const fields = await readPackageFields(installed)
  if (fields?.name !== name || typeof fields.version !== 'string') {
    return false
  }
  const range = validRange(specification)
  return !!range && satisfies(fields.version, range)
}

async function refreshLocalPackages(
  manifest: TypeScriptProjectPackage,
  packages: ConsumerPackages,
  ui: WorkflowUI,
): Promise<void> {
  for (const [name, specification] of Object.entries(packages)) {
    const source = resolveLocalSource(manifest.directory, specification)
    const installed = Path.join(manifest.directory, 'node_modules', name)
    if (source && isDirectory(source) && await hasChangedLocalDirectory(source, installed)) {
      const hasLock = FS.existsSync(Path.join(manifest.directory, 'bun.lock'))
      if (!hasLock) {
        await confirmConsumerInstall(manifest.directory, ui)
      }
      const options = hasLock ? ['--frozen-lockfile', '--force'] : ['--force']
      await installConsumerDependencies(manifest, options)
      return
    }
  }
}

async function hasChangedLocalDirectory(source: string, installed: string): Promise<boolean> {
  if (FS.realpathSync(source) === FS.realpathSync(installed)) {
    return false
  }
  const paths = await listPackageFiles(source)
  if (paths.length !== (await listPackageFiles(installed)).length) {
    return true
  }
  for (const path of paths) {
    const counterpart = Path.join(installed, Path.relative(source, path))
    if (!FS.existsSync(counterpart)) {
      return true
    }
    if (FS.realpathSync(path) === FS.realpathSync(counterpart)) {
      continue
    }
    const original = Platform.hashBytes(await FS.readFile(path), 'sha256')
    const copy = Platform.hashBytes(await FS.readFile(counterpart), 'sha256')
    if (original !== copy) {
      return true
    }
  }
  return false
}

async function listPackageFiles(directory: string): Promise<string[]> {
  const paths: string[] = []
  for (const entry of await FS.readdir(directory, { withFileTypes: true })) {
    const path = Path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!Files.skipDirectory(entry.name)) {
        paths.push(...await listPackageFiles(path))
      }
    } else if (entry.isFile() || entry.isSymbolicLink() && isLinkedPackageFile(path)) {
      paths.push(path)
    } else {
      // Ignore directory symlinks and entries that do not resolve to files.
    }
  }
  return paths
}

function isLinkedPackageFile(path: string): boolean {
  return Try.WithDefault(false, () => FS.statSync(path).isFile())
}

async function installConsumerDependencies(
  manifest: TypeScriptProjectPackage,
  options: readonly string[] = [],
): Promise<void> {
  const args = ['install', '--ignore-scripts', ...options]
  await Exec.capture('bun', args, { cwd: manifest.directory })
}

async function updateLocalDependencyGraph(
  directory: string,
  current: ConsumerInstallState,
  previous: PreviousConsumerInstall,
): Promise<void> {
  const names = Object.keys(current.localSources).filter(name =>
    current.localSources[name] !== previous?.localSources[name]
  )
  if (names.length) {
    await Exec.capture('bun', ['update', '--ignore-scripts', ...names], { cwd: directory })
  }
}

async function readInstallState(directory: string, packages: ConsumerPackages): Promise<ConsumerInstallState> {
  const manifest = await FS.readFile(Path.join(directory, 'package.json'), 'utf8')
  const lock = await readOptionalText(Path.join(directory, 'bun.lock'))
  const localSources: ConsumerPackages = {}
  for (const [name, specification] of Object.entries(packages)) {
    const source = resolveLocalSource(directory, specification)
    if (source) {
      localSources[name] = Platform.hashText(Json.Canonical(await describeLocalSource(source)))
    }
  }
  const fingerprint = Platform.hashText(Json.Canonical([manifest, lock ?? null, localSources]))
  return { fingerprint, localSources }
}

const LocalPackagePrefixes = ['file:', 'link:']
const PackageFieldsSchema = Schema.record(Schema.string(), Schema.unknown())
const PackageGraphFields = [
  'name',
  'version',
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundleDependencies',
  'bundledDependencies',
  'os',
  'cpu',
  'libc',
]

function resolveLocalSource(directory: string, specification: string): string | undefined {
  const prefix = LocalPackagePrefixes.find(candidate => specification.startsWith(candidate))
  if (prefix) {
    return Path.resolve(directory, specification.slice(prefix.length))
  }
}

async function describeLocalSource(source?: string): Promise<unknown> {
  if (!source || !FS.existsSync(source)) {
    return null
  }
  if (isDirectory(source)) {
    const fields = await readPackageFields(source)
    return PackageGraphFields.map(name => fields?.[name] ?? null)
  }
  return Platform.hashBytes(await FS.readFile(source), 'sha256')
}

function isDirectory(path: string): boolean {
  return Try.WithDefault(false, () => FS.statSync(path).isDirectory())
}

async function readPackageFields(directory: string) {
  const manifest = Path.join(directory, 'package.json')
  return await Try.WithDefault(undefined, () => FS.readJson(manifest, { schema: PackageFieldsSchema }))
}

const InstallReceiptSchema = Schema.object({
  fingerprint: Schema.string(),
  localSources: Schema.record(Schema.string(), Schema.string()),
})

async function readInstallReceipt(path: string): Promise<PreviousConsumerInstall> {
  return await Try.WithDefault(undefined, () => FS.readJson(path, { schema: InstallReceiptSchema }))
}

async function readOptionalText(path: string): Promise<string | undefined> {
  return await FS.exists(path) ? await FS.readFile(path, 'utf8') : undefined
}
