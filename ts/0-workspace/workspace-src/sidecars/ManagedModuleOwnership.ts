import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'

/** ManagedModuleOwner records the consumer profile and package links owning generated module files. */
export type ManagedModuleOwner = {
  profile: string
  packages: string[]
  generatedHashes?: Record<string, string>
}

/** validateModuleOwnership checks current files and accepts transitions only within one project cache. */
export async function validateModuleOwnership(
  ownerText: string | undefined,
  marker: string,
  profile: string,
  projectRoot: string,
  files: readonly (readonly [string, string])[],
  expectedOwner: string,
  repair: boolean,
): Promise<ManagedModuleOwner | undefined> {
  if (ownerText === undefined) {
    return undefined
  }
  const owner = parseOwner(ownerText, marker)
  validateOwnerProfile(owner, profile, projectRoot, marker)
  if (ownerText !== expectedOwner && owner.profile === profile && !repair) {
    Errors.ThrowUserInput(`Module metadata ownership marker needs repair: ${marker}`)
  }
  await validateGeneratedFiles(files, owner, repair, marker)
  return owner
}

/** linkModulePackages creates or atomically retargets only symlinks proven to belong to the old profile. */
export async function linkModulePackages(
  directory: string,
  profile: string,
  packages: string[],
  previousOwner?: ManagedModuleOwner,
): Promise<void> {
  await validateModuleLinks(directory, profile, packages, previousOwner)
  const localModules = Path.join(directory, 'node_modules')
  await FileSystem.mkdir(localModules, { recursive: true })
  for (const name of previousOwner?.packages ?? []) {
    if (!packages.includes(name)) {
      await removeOwnedLink(localModules, name, previousOwner!.profile)
    }
  }
  for (const name of packages) {
    await linkPackage(localModules, name, profile, previousOwner)
  }
}

/** validateModuleLinks ensures all existing paths are absent or still point to the recorded owner. */
export async function validateModuleLinks(
  directory: string,
  profile: string,
  packages: string[],
  previousOwner?: ManagedModuleOwner,
): Promise<void> {
  const localModules = Path.join(directory, 'node_modules')
  for (const name of new Set([...packages, ...previousOwner?.packages ?? []])) {
    const link = Path.join(localModules, name)
    if (!FileSystem.existsSync(link)) {
      continue
    }
    const pointsToTarget = await pointsToProfile(link, profile, name)
    const pointsToPriorOwner = previousOwner && await pointsToProfile(link, previousOwner.profile, name)
    if (!pointsToTarget && !pointsToPriorOwner) {
      Errors.ThrowUserInput(`Module resolution path is not owned by the current or prior profile: ${link}`)
    }
  }
}

function parseOwner(ownerText: string, marker: string): ManagedModuleOwner {
  const owner = Try.WithDefault(undefined, () => JSON.parse(ownerText) as ManagedModuleOwner)
  if (
    !owner || typeof owner.profile !== 'string' || !Array.isArray(owner.packages)
    || !owner.packages.every(isPackageName)
  ) {
    Errors.ThrowUserInput(`Module metadata ownership marker is invalid: ${marker}`)
  }
  return owner
}

function isPackageName(name: unknown): name is string {
  if (typeof name !== 'string') {
    return false
  }
  const segments = name.split('/')
  const scoped = segments.length === 2 && segments[0]!.startsWith('@')
  return segments.length === (scoped ? 2 : 1)
    && segments.every((segment, index) => {
      const validSegment = scoped && index === 0 ? segment.slice(1) : segment
      return /^[A-Za-z0-9._-]+$/.test(validSegment) && validSegment !== '.' && validSegment !== '..'
    })
}

function validateOwnerProfile(
  owner: ManagedModuleOwner,
  profile: string,
  projectRoot: string,
  marker: string,
): void {
  if (owner.profile === profile) {
    return
  }
  const cache = Path.resolve(projectRoot, '.tao', 'cache', 'managed-modules')
  if (Path.dirname(owner.profile) === cache) {
    return
  }
  Errors.ThrowUserInput(
    `Tao module metadata at ${marker} is already owned by consumer profile ${owner.profile}; `
      + `this consumer requires ${profile}. A live module directory can use one app dependency graph. `
      + `Use separate module directories or align both consumers' requirements.`,
  )
}

async function validateGeneratedFiles(
  files: readonly (readonly [string, string])[],
  owner: ManagedModuleOwner,
  repair: boolean,
  marker: string,
): Promise<void> {
  if (repair) {
    return
  }
  for (const [path] of files) {
    const hash = owner.generatedHashes?.[path]
    const current = await Try.WithDefault(undefined, () => FileSystem.readFile(path, 'utf8'))
    if (current === undefined || hash === undefined || hash !== Platform.hashText(current)) {
      Errors.ThrowUserInput(
        `Owned module metadata drifted at ${path}; preserve edits or run tao prepare --repair before changing requirements. `
          + `Owner marker: ${marker}`,
      )
    }
  }
}

async function linkPackage(
  localModules: string,
  name: string,
  profile: string,
  previousOwner: ManagedModuleOwner | undefined,
): Promise<void> {
  const link = Path.join(localModules, name)
  const target = Path.join(profile, 'node_modules', name)
  await FileSystem.mkdir(Path.dirname(link), { recursive: true })
  if (!await FileSystem.exists(link)) {
    if (FileSystem.existsSync(link)) {
      Errors.ThrowUserInput(`Module resolution path is already owned: ${link}`)
    }
    await FileSystem.symlink(target, link, 'dir')
    return
  }
  const currentTarget = FileSystem.realpathSync(link)
  if (currentTarget === FileSystem.realpathSync(target)) {
    return
  }
  if (previousOwner && await pointsToProfile(link, previousOwner.profile, name)) {
    await FileSystem.replaceDirectoryLink(target, link)
    return
  }
  Errors.ThrowUserInput(`Module resolution path is already owned: ${link}`)
}

async function removeOwnedLink(localModules: string, name: string, profile: string): Promise<void> {
  const link = Path.join(localModules, name)
  if (!FileSystem.existsSync(link)) {
    return
  }
  if (!await pointsToProfile(link, profile, name)) {
    Errors.ThrowUserInput(`Cannot remove module resolution path not owned by the prior profile: ${link}`)
  }
  await FileSystem.rm(link, { force: true })
}

async function pointsToProfile(link: string, profile: string, name: string): Promise<boolean> {
  if (!FileSystem.lstatSync(link).isSymbolicLink()) {
    return false
  }
  const expected = Path.join(profile, 'node_modules', name)
  return await FileSystem.exists(expected) && FileSystem.realpathSync(link) === FileSystem.realpathSync(expected)
}
