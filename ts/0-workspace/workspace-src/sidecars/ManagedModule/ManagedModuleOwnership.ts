import { Json, Schema, UserInput } from '@shared'
import { Lists, Try } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { isNpmPackageName } from '../../NpmPackageName'

type SerializedModuleOwner = string | undefined
type PreviousModuleOwner = ManagedModuleOwner | undefined

/** ManagedModuleOwner records the consumer profile and package links owning generated module files. */
export type ManagedModuleOwner = Schema.infer<typeof managedModuleOwnerSchema>

/** validateModuleOwnership checks current files and accepts transitions only within one project cache. */
export async function validateModuleOwnership(
  ownerText: SerializedModuleOwner,
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
  const owner = parseOwner(ownerText)
  if (!owner) {
    if (!repair) {
      UserInput.fail(`Module metadata ownership marker needs repair: ${marker}. Run tao setup --repair.`)
    }
    await validateCorruptMarkerRecovery(files, profile, projectRoot, marker)
    return undefined
  }
  validateOwnerProfile(owner, profile, projectRoot, marker)
  if (ownerText !== expectedOwner && owner.profile === profile && !repair) {
    UserInput.fail(`Module metadata ownership marker needs repair: ${marker}`)
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
  await FS.mkdir(localModules)
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
  if (isSymbolicLink(localModules)) {
    UserInput.fail(`Module resolution directory is already owned: ${localModules}`)
  }
  for (const name of Lists.unique(packages, previousOwner?.packages ?? [])) {
    const link = Path.join(localModules, name)
    if (Path.dirname(link) !== localModules && isSymbolicLink(Path.dirname(link))) {
      UserInput.fail(`Module resolution path is not owned by the current or prior profile: ${link}`)
    }
    if (!isSymbolicLink(link)) {
      if (FS.existsSync(link)) {
        UserInput.fail(`Module resolution path is not owned by the current or prior profile: ${link}`)
      }
      continue
    }
    const pointsToTarget = await pointsToProfile(link, profile, name)
    const pointsToPriorOwner = previousOwner && pointsToRecordedProfile(link, previousOwner.profile, name)
    if (!pointsToTarget && !pointsToPriorOwner) {
      UserInput.fail(`Module resolution path is not owned by the current or prior profile: ${link}`)
    }
  }
}

async function validateCorruptMarkerRecovery(
  files: readonly (readonly [string, string])[],
  profile: string,
  projectRoot: string,
  marker: string,
): Promise<void> {
  const cache = Path.join(projectRoot, '.tao', 'cache', 'managed-modules')
  const profileIsExpected = Path.isWithin(cache, profile)
    && Path.resolve(Path.dirname(profile)) === Path.resolve(cache)
  const generatedFilesMatch = files.length > 0
    && (await Promise.all(
      files.map(async ([path, contents]) =>
        await Try.WithDefault(undefined, () => FS.readFile(path, 'utf8')) === contents
      ),
    )).every(Boolean)
  const packageFile = files.find(([path]) => Path.basename(path) === 'package.json')
  const packages = packageFile && Try.WithDefault(
    undefined,
    () => parseGeneratedModulePackageNames(packageFile[1]),
  )
  const linksMatch = Boolean(packages?.length)
    && (await Promise.all(
      packages!.map(async name =>
        await pointsToProfile(Path.join(Path.dirname(marker), 'node_modules', name), profile, name)
      ),
    )).every(Boolean)
  if (profileIsExpected && generatedFilesMatch && linksMatch) {
    return
  }
  UserInput.fail(
    `Module ownership marker is corrupt and Tao cannot prove that the generated metadata belongs to this profile: ${marker}. `
      + `Preserve this marker and any authored package.json or tsconfig.json. Restore a valid marker backup, or inspect those files and `
      + `the node_modules links; move authored files aside before removing only files confirmed as Tao-generated, then run tao setup again.`,
  )
}

type GeneratedModuleDependencyFields = Record<string, unknown>
type GeneratedModuleManifest = { dependencies?: GeneratedModuleDependencyFields }

function parseGeneratedModulePackageNames(contents: string): string[] {
  const manifest = Json.Parse(contents) as GeneratedModuleManifest
  return Object.keys(manifest.dependencies ?? {})
}

function parseOwner(ownerText: string): ManagedModuleOwner | undefined {
  return Try.WithDefault(undefined, () => parseManagedModuleOwner(ownerText))
}

const managedModuleOwnerSchema = Schema.looseObject({
  profile: Schema.string(),
  packages: Schema.array(Schema.string().refine(isNpmPackageName)),
  generatedHashes: Schema.record(Schema.string(), Schema.string()).optional(),
})

function parseManagedModuleOwner(contents: string): ManagedModuleOwner {
  return Json.Parse(contents, { schema: managedModuleOwnerSchema })
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
  if (
    Path.isWithin(cache, owner.profile)
    && Path.resolve(Path.dirname(owner.profile)) === Path.resolve(cache)
  ) {
    return
  }
  UserInput.fail(
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
    const current = await Try.WithDefault(undefined, () => FS.readFile(path, 'utf8'))
    if (current === undefined || hash === undefined || hash !== Platform.hashText(current)) {
      UserInput.fail(
        `Owned module metadata drifted at ${path}; preserve edits or run tao setup --repair before changing requirements. `
          + `Owner marker: ${marker}`,
      )
    }
  }
}

async function linkPackage(
  localModules: string,
  name: string,
  profile: string,
  previousOwner: PreviousModuleOwner,
): Promise<void> {
  const link = Path.join(localModules, name)
  const target = Path.join(profile, 'node_modules', name)
  await FS.mkdir(Path.dirname(link))
  if (!isSymbolicLink(link) && !FS.existsSync(link)) {
    await FS.symlink(target, link, 'dir')
    return
  }
  if (!isSymbolicLink(link)) {
    UserInput.fail(`Module resolution path is already owned: ${link}`)
  }
  if (!FS.existsSync(link)) {
    if (previousOwner && await pointsToRecordedProfile(link, previousOwner.profile, name)) {
      await FS.rm(link, { force: true })
      await FS.symlink(target, link, 'dir')
      return
    }
    UserInput.fail(`Module resolution path is already owned: ${link}`)
  }
  const currentTarget = FS.realpathSync(link)
  if (currentTarget === FS.realpathSync(target)) {
    return
  }
  if (previousOwner && await pointsToProfile(link, previousOwner.profile, name)) {
    await FS.replaceDirectoryLink(target, link)
    return
  }
  UserInput.fail(`Module resolution path is already owned: ${link}`)
}

async function removeOwnedLink(localModules: string, name: string, profile: string): Promise<void> {
  const link = Path.join(localModules, name)
  if (!isSymbolicLink(link) && !FS.existsSync(link)) {
    return
  }
  if (!isSymbolicLink(link) || !await pointsToRecordedProfile(link, profile, name)) {
    UserInput.fail(`Cannot remove module resolution path not owned by the prior profile: ${link}`)
  }
  await FS.rm(link, { force: true })
}

async function pointsToProfile(link: string, profile: string, name: string): Promise<boolean> {
  if (!isSymbolicLink(link)) {
    return false
  }
  const expected = Path.join(profile, 'node_modules', name)
  return await FS.exists(expected) && Try.WithDefault(
    false,
    () => FS.realpathSync(link) === FS.realpathSync(expected),
  )
}

function pointsToRecordedProfile(link: string, profile: string, name: string): boolean {
  const expected = Path.resolve(profile, 'node_modules', name)
  const recorded = FS.readlinkSync(link)
  return Path.resolve(Path.dirname(link), recorded) === expected
}

function isSymbolicLink(path: string): boolean {
  return Try.WithDefault(false, () => FS.lstatSync(path).isSymbolicLink())
}
