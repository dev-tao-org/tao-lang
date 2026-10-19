import { Errors, Try } from '@shared'
import { Files, FileSystem, Path, Platform } from '@shared/os'
import { isNpmPackageName } from '../NpmPackageName'
import { withManagedModuleLock } from './ManagedModuleLock'

/** cleanManagedModuleMetadata removes recorded metadata owned by this consumer project. */
export async function cleanManagedModuleMetadata(
  projectRoot: string,
  externalModuleRoots: readonly string[] = [],
): Promise<string[]> {
  const warnings: string[] = []
  const roots = [projectRoot, ...externalModuleRoots]
  const markers = [
    ...new Set(
      (await Promise.all(roots.map((root, index) => walkRoot(root, index > 0))))
        .flat().filter(path => Path.basename(path) === '.tao-managed-module.json'),
    ),
  ]
  for (const marker of markers) {
    const warning = await cleanModuleMarker(projectRoot, marker)
    if (warning) {
      warnings.push(warning)
    }
  }
  return warnings
}

async function walkRoot(root: string, optional: boolean): Promise<string[]> {
  return await Try<Promise<string[]>, string[]>(() => Files.walk(root), {
    catch(error) {
      if (optional && isMissing(error)) {
        return []
      }
      Errors.Throw(error)
    },
  })
}

async function cleanModuleMarker(projectRoot: string, marker: string): Promise<string | undefined> {
  return await withManagedModuleLock(Path.dirname(marker), () => cleanOwnedModuleMarker(projectRoot, marker))
}

async function cleanOwnedModuleMarker(projectRoot: string, marker: string): Promise<string | undefined> {
  if (isSymbolicLink(marker)) {
    return `Skipped uncertain managed module metadata at ${marker}: marker is a symbolic link.`
  }
  const metadata = await readModuleMetadata(marker)
  if (!metadata) {
    return `Skipped uncertain managed module metadata at ${marker}: marker is malformed or incomplete; inspect and repair it before removing module files.`
  }
  const moduleDirectory = Path.dirname(marker)
  const profile = typeof metadata.profile === 'string' ? Path.resolve(metadata.profile) : ''
  const profileRoots = [
    Path.join(projectRoot, '.tao'),
    Path.join(projectRoot, '.tao', 'cache'),
    Path.join(projectRoot, '.tao', 'cache', 'managed-modules'),
  ]
  const managedRoot = Path.join(projectRoot, '.tao', 'cache', 'managed-modules')
  if (
    profileRoots.some(isSymbolicLink)
    || !Path.isWithin(managedRoot, profile)
    || Path.resolve(Path.dirname(profile)) !== Path.resolve(managedRoot)
  ) {
    return `Skipped uncertain managed module metadata at ${marker}: recorded profile is outside this project's managed module cache.`
  }
  if (!await isOwnedProfileOrMissing(profile)) {
    return `Skipped uncertain managed module metadata at ${marker}: recorded profile ownership could not be verified.`
  }
  await cleanModuleLinks(moduleDirectory, profile, metadata.packages)
  if (!await cleanModuleFiles(marker, metadata)) {
    return `Skipped changed managed module files at ${marker}; edited files were preserved.`
  }
  return undefined
}

async function readModuleMetadata(marker: string): Promise<Record<string, unknown> | undefined> {
  const metadata = await Try.WithDefault(
    undefined,
    async () => JSON.parse(await FileSystem.readFile(marker, 'utf8')) as Record<string, unknown>,
  )
  const packages = metadata?.packages
  const files = metadata?.files
  const hashes = metadata?.generatedHashes
  if (
    !metadata || typeof metadata.profile !== 'string'
    || !Array.isArray(packages)
    || packages.some(name => typeof name !== 'string' || !isNpmPackageName(name))
    || !Array.isArray(files)
    || files.some(path => typeof path !== 'string')
    || files.some(path => typeof path === 'string' && !isManagedModuleFile(Path.dirname(marker), path))
    || !hashes || typeof hashes !== 'object'
    || files.some(path => typeof path === 'string' && typeof (hashes as Record<string, unknown>)[path] !== 'string')
  ) {
    return undefined
  }
  return metadata
}

async function isOwnedProfileOrMissing(profile: string): Promise<boolean> {
  if (isSymbolicLink(profile) || !await FileSystem.exists(profile)) {
    return !isSymbolicLink(profile)
  }
  const marker = Path.join(profile, '.tao-managed.json')
  if (isSymbolicLink(marker) || !await FileSystem.exists(marker)) {
    return false
  }
  const metadata = await Try.WithDefault(
    undefined,
    async () => JSON.parse(await FileSystem.readFile(marker, 'utf8')) as Record<string, unknown>,
  )
  return metadata?.fingerprint === Path.basename(profile) && typeof metadata.lockHash === 'string'
}

async function cleanModuleFiles(
  marker: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  let complete = true
  const generatedHashes = metadata.generatedHashes && typeof metadata.generatedHashes === 'object'
    ? metadata.generatedHashes as Record<string, unknown>
    : {}
  for (const path of metadata.files as string[]) {
    if (await FileSystem.exists(path) && !FileSystem.lstatSync(path).isSymbolicLink()) {
      const current = await FileSystem.readFile(path, 'utf8')
      if (typeof generatedHashes[path] !== 'string' || generatedHashes[path] !== Platform.hashText(current)) {
        complete = false
        continue
      }
      await FileSystem.chmod(path, 0o644)
      await FileSystem.rm(path, { force: true })
    }
  }
  if (!complete) {
    return false
  }
  await FileSystem.chmod(marker, 0o644)
  await FileSystem.rm(marker, { force: true })
  return true
}

function isManagedModuleFile(moduleDirectory: string, path: string): boolean {
  return Path.resolve(Path.dirname(path)) === Path.resolve(moduleDirectory)
    && ['package.json', 'tsconfig.json'].includes(Path.basename(path))
}

async function cleanModuleLinks(moduleDirectory: string, profile: string, value: unknown): Promise<void> {
  if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || !isNpmPackageName(name))) {
    Errors.ThrowUserInput(`Managed module ownership marker contains invalid package names: ${moduleDirectory}`)
  }
  const localModules = Path.join(moduleDirectory, 'node_modules')
  if (isSymbolicLink(localModules)) {
    return
  }
  for (const name of value as string[]) {
    const link = Path.join(moduleDirectory, 'node_modules', name)
    const target = Path.join(profile, 'node_modules', name)
    if (Path.dirname(link) !== localModules && isSymbolicLink(Path.dirname(link))) {
      continue
    }
    if (isSymbolicLink(link) && pointsToRecordedTarget(link, target)) {
      await FileSystem.rm(link, { force: true })
      await removeEmptyParents(Path.dirname(link), Path.join(moduleDirectory, 'node_modules'))
    }
  }
}

async function removeEmptyParents(directory: string, root: string): Promise<void> {
  if (Path.resolve(directory) === Path.resolve(root) || !Path.isWithin(root, directory)) {
    return
  }
  if ((await FileSystem.readdir(directory)).length === 0) {
    await FileSystem.rm(directory, { recursive: true, force: true })
    await removeEmptyParents(Path.dirname(directory), root)
  }
}

function isSymbolicLink(path: string): boolean {
  return Try.WithDefault(false, () => FileSystem.lstatSync(path).isSymbolicLink())
}

function pointsToRecordedTarget(link: string, target: string): boolean {
  const recorded = FileSystem.readlinkSync(link)
  return Path.resolve(Path.dirname(link), recorded) === Path.resolve(target)
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
