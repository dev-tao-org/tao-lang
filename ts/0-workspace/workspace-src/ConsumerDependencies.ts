import { Json } from '@shared'
import { Try, UserInput } from '@shared'
import { Files, FS, Path, Platform, Storage } from '@shared/os'
import Exec from '@shared/os/exec'
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

const InstallReceipt = '.tao-consumer-install'

async function prepareInstalledConsumer(manifest: TypeScriptProjectPackage, ui: WorkflowUI): Promise<void> {
  const { directory } = manifest
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
  if (!names.length) {
    return
  }
  const receiptPath = Path.join(directory, 'node_modules', InstallReceipt)
  const receipt = await readOptionalText(receiptPath)
  const fingerprint = await fingerprintInstallInputs(directory)
  const hasPackages = names.every(name => hasInstalledPackage(directory, name))
  if (!hasPackages || receipt !== undefined && receipt !== fingerprint) {
    await confirmConsumerInstall(directory, ui)
    await installConsumerDependencies(manifest)
    UserInput.require(
      names.every(name => hasInstalledPackage(directory, name)),
      `The install did not prepare all declared packages in ${directory}.`,
    )
  } else {
    await refreshLocalPackages(manifest, ui)
  }
  await FS.writeIfChanged(receiptPath, await fingerprintInstallInputs(directory))
}

async function confirmConsumerInstall(directory: string, ui: WorkflowUI): Promise<void> {
  const message = `The TypeScript consumer at ${directory} needs dependency setup.`
  UserInput.require(await ui.confirm({ entry: directory, message }), 'Dependency setup was declined.')
  UserInput.require(!ui.cancelled?.(), 'Workflow cancelled.')
}

function hasInstalledPackage(directory: string, name: string): boolean {
  UserInput.require(isNpmPackageName(name), `Invalid consumer dependency name: ${name}`)
  return FS.existsSync(Path.join(directory, 'node_modules', name, 'package.json'))
}

const RuntimePackageName = '@tao/runtime'

async function refreshLocalPackages(manifest: TypeScriptProjectPackage, ui: WorkflowUI): Promise<void> {
  if (
    await hasStaleLocalPackage(manifest, RuntimePackageName)
    || await hasStaleLocalPackage(manifest, manifest.compile?.name)
  ) {
    const hasLock = FS.existsSync(Path.join(manifest.directory, 'bun.lock'))
    if (!hasLock) {
      await confirmConsumerInstall(manifest.directory, ui)
    }
    const options = hasLock ? ['--frozen-lockfile', '--force'] : ['--force']
    await installConsumerDependencies(manifest, options)
  }
}

async function hasStaleLocalPackage(manifest: TypeScriptProjectPackage, name?: string): Promise<boolean> {
  if (!name) {
    return false
  }
  const specifier = manifest.dependencies[name]
  if (!specifier?.startsWith('file:')) {
    return false
  }
  const source = Path.resolve(manifest.directory, specifier.slice('file:'.length))
  const installed = Path.join(manifest.directory, 'node_modules', name)
  if (!FS.existsSync(source) || FS.realpathSync(source) === FS.realpathSync(installed)) {
    return false
  }
  return await hasChangedPackageFiles(source, installed)
}

async function hasChangedPackageFiles(source: string, installed: string): Promise<boolean> {
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

async function fingerprintInstallInputs(directory: string): Promise<string> {
  const manifest = await FS.readFile(Path.join(directory, 'package.json'), 'utf8')
  const lock = await readOptionalText(Path.join(directory, 'bun.lock'))
  return Platform.hashText(Json.Print([manifest, lock ?? null]))
}

async function readOptionalText(path: string): Promise<string | undefined> {
  return await FS.exists(path) ? await FS.readFile(path, 'utf8') : undefined
}
