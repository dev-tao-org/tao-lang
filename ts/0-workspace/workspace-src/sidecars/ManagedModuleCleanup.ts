import { Errors, Try } from '@shared'
import { Files, FileSystem, Path } from '@shared/os'
import { withManagedModuleLock } from './ManagedModuleLock'

/** cleanManagedModuleMetadata removes only Tao-owned metadata and links inside one project. */
export async function cleanManagedModuleMetadata(projectRoot: string): Promise<void> {
  const markers = (await Files.walk(projectRoot)).filter(path => Path.basename(path) === '.tao-managed-module.json')
  for (const marker of markers) {
    await cleanModuleMarker(projectRoot, marker)
  }
}

async function cleanModuleMarker(projectRoot: string, marker: string): Promise<void> {
  await withManagedModuleLock(Path.dirname(marker), () => cleanOwnedModuleMarker(projectRoot, marker))
}

async function cleanOwnedModuleMarker(projectRoot: string, marker: string): Promise<void> {
  rejectSymlink(marker)
  const metadata = await Try(
    async () => JSON.parse(await FileSystem.readFile(marker, 'utf8')) as Record<string, unknown>,
    { catch: () => Errors.ThrowUserInput(`Managed module ownership marker is invalid: ${marker}`) },
  )
  const moduleDirectory = Path.dirname(marker)
  const profile = typeof metadata.profile === 'string' ? metadata.profile : ''
  const managedRoot = Path.join(projectRoot, '.tao', 'cache', 'managed-modules')
  if (!isInside(projectRoot, managedRoot) || !isInside(managedRoot, profile)) {
    Errors.ThrowUserInput(`Managed module ownership marker points outside its project: ${marker}`)
  }
  if (!await FileSystem.exists(profile)) {
    return
  }
  const realRoot = FileSystem.realpathSync(projectRoot)
  const realManagedRoot = Path.join(realRoot, '.tao', 'cache', 'managed-modules')
  if (!isInside(realManagedRoot, FileSystem.realpathSync(profile))) {
    Errors.ThrowUserInput(`Managed module ownership marker points outside its project: ${marker}`)
  }
  await validateProfileOwnership(profile, marker)
  await cleanModuleLinks(moduleDirectory, profile, metadata.packages)
  await cleanModuleFiles(moduleDirectory, marker, metadata)
}

async function validateProfileOwnership(profile: string, marker: string): Promise<void> {
  const profileMarker = Path.join(profile, '.tao-managed.json')
  rejectSymlink(profileMarker)
  const metadata = await Try(
    async () => JSON.parse(await FileSystem.readFile(profileMarker, 'utf8')) as Record<string, unknown>,
    { catch: () => Errors.ThrowUserInput(`Managed npm profile ownership is invalid: ${profileMarker}`) },
  )
  if (metadata.fingerprint !== Path.basename(profile) || typeof metadata.lockHash !== 'string') {
    Errors.ThrowUserInput(`Managed module ownership marker has no matching npm profile: ${marker}`)
  }
}

async function cleanModuleFiles(
  moduleDirectory: string,
  marker: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!Array.isArray(metadata.files) || metadata.files.some(path => typeof path !== 'string')) {
    Errors.ThrowUserInput(`Managed module ownership marker is invalid: ${marker}`)
  }
  for (const path of metadata.files as string[]) {
    if (
      Path.resolve(Path.dirname(path)) !== Path.resolve(moduleDirectory)
      || !['package.json', 'tsconfig.json'].includes(Path.basename(path))
    ) {
      Errors.ThrowUserInput(`Managed module ownership marker contains an invalid path: ${marker}`)
    }
    if (await FileSystem.exists(path) && !FileSystem.lstatSync(path).isSymbolicLink()) {
      await FileSystem.chmod(path, 0o644)
      await FileSystem.rm(path, { force: true })
    }
  }
  await FileSystem.chmod(marker, 0o644)
  await FileSystem.rm(marker, { force: true })
}

async function cleanModuleLinks(moduleDirectory: string, profile: string, value: unknown): Promise<void> {
  if (!Array.isArray(value) || value.some(name => typeof name !== 'string')) {
    return
  }
  for (const name of value as string[]) {
    if (!isManagedPackageName(name)) {
      Errors.ThrowUserInput(`Managed module ownership marker contains an invalid package name: ${name}`)
    }
    const link = Path.join(moduleDirectory, 'node_modules', name)
    const target = Path.join(profile, 'node_modules', name)
    if (
      FileSystem.existsSync(link) && FileSystem.lstatSync(link).isSymbolicLink()
      && FileSystem.existsSync(target) && FileSystem.realpathSync(link) === FileSystem.realpathSync(target)
    ) {
      await FileSystem.rm(link, { force: true })
      await removeEmptyParents(Path.dirname(link), Path.join(moduleDirectory, 'node_modules'))
    }
  }
}

function isManagedPackageName(name: string): boolean {
  return /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name)
    && !name.split('/').some(segment => segment === '.' || segment === '..')
}

async function removeEmptyParents(directory: string, root: string): Promise<void> {
  if (directory === root || !isInside(root, directory)) {
    return
  }
  if ((await FileSystem.readdir(directory)).length === 0) {
    await FileSystem.rm(directory, { recursive: true, force: true })
    await removeEmptyParents(Path.dirname(directory), root)
  }
}

function isInside(root: string, path: string): boolean {
  const relative = Path.relative(root, path).replaceAll('\\', '/')
  return relative !== '' && relative !== '..' && !relative.startsWith('../') && !Path.isAbsolute(relative)
}

function rejectSymlink(path: string): void {
  if (FileSystem.existsSync(path) && FileSystem.lstatSync(path).isSymbolicLink()) {
    Errors.ThrowUserInput(`Managed module ownership marker cannot be a symbolic link: ${path}`)
  }
}
