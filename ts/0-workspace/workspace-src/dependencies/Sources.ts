import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import type { DependencyRequirement, DependencyStoreOptions, LockedSource } from './Types'

/** defaultSourceAlias chooses an import alias from the source identifier. */
export function defaultSourceAlias(requirement: DependencyRequirement): string {
  return requirement.provider === 'github'
    ? requirement.identifier.replace(/\.git$/, '').split('/').at(-1)!
    : Path.basename(requirement.identifier.replaceAll('\\', '/'))
}

/** sourceIdentity identifies a producer independently from its consumer alias. */
export function sourceIdentity(requirement: DependencyRequirement, parent: string, projectRoot: string): string {
  if (requirement.provider === 'file') {
    const absolute = canonicalFileSource(parent, requirement.identifier)
    const relative = Path.relative(projectRoot, absolute).replaceAll('\\', '/')
    return `file:${relative}`
  }
  return `${requirement.provider}:${requirement.identifier}${
    requirement.subdirectory ? `/${requirement.subdirectory}` : ''
  }`
}

/** resolveSource selects the provider adapter and resolves one exact source. */
export async function resolveSource(
  requirement: DependencyRequirement,
  identity: string,
  projectRoot: string,
  parent: string,
  previous: LockedSource | undefined,
  update: boolean,
  options: DependencyStoreOptions,
): Promise<LockedSource> {
  if (requirement.provider === 'file') {
    return await resolveFileSource(requirement, identity, parent)
  }
  if (requirement.provider === 'bundled') {
    return resolveBundledSource(requirement, identity, options)
  }
  return await resolveGitHubSource(requirement, identity, projectRoot, previous, update, options)
}

function preparationNeeded(message: string): never {
  Errors.ThrowUserInput(message)
}

function canonicalFileSource(parent: string, identifier: string): string {
  const path = Path.isAbsolute(identifier) ? identifier : Path.resolve(parent, identifier)
  return Try.WithDefault(path, () => FileSystem.realpathSync(path))
}

/** assertTaoProjectRoot rejects source locations without Tao project metadata. */
export function assertTaoProjectRoot(location: string, label: string): void {
  requireProjectRoot(location, label)
}

function requireProjectRoot(location: string, label: string): void {
  const marker = Path.join(location, '.tao')
  const valid = Try.WithDefault(false, () => FileSystem.lstatSync(location).isDirectory())
    && Try.WithDefault(false, () => FileSystem.lstatSync(marker).isDirectory())
  if (!valid) {
    preparationNeeded(`${label} must point to a Tao project root containing .tao/.`)
  }
}

function resolveFileSource(
  requirement: DependencyRequirement,
  identity: string,
  parent: string,
): Promise<LockedSource> {
  return fileSource(requirement, identity, parent)
}

async function fileSource(
  requirement: DependencyRequirement,
  identity: string,
  parent: string,
): Promise<LockedSource> {
  if (requirement.provider !== 'file') {
    Errors.Throw('Expected file dependency.')
  }
  const sourcePath = Path.resolve(parent, requirement.identifier)
  if (!await FileSystem.exists(sourcePath)) {
    preparationNeeded(`File dependency ${requirement.identifier} was not found from ${parent}.`)
  }
  const location = canonicalFileSource(parent, sourcePath)
  requireProjectRoot(location, `File dependency ${requirement.identifier}`)
  return {
    identity,
    provider: 'file',
    identifier: requirement.identifier,
    version: requirement.version,
    location,
    requirements: [],
  }
}

function resolveBundledSource(
  requirement: DependencyRequirement,
  identity: string,
  options: DependencyStoreOptions,
): LockedSource {
  if (requirement.provider !== 'bundled') {
    Errors.Throw('Expected bundled dependency.')
  }
  const root = options.bundledProjects?.[requirement.identifier]
    ?? preparationNeeded(`Bundled project ${requirement.identifier} is unavailable; prepare dependencies, then retry.`)
  const location = Path.resolve(root)
  requireProjectRoot(location, `Bundled project ${requirement.identifier}`)
  return {
    identity,
    provider: 'bundled',
    identifier: requirement.identifier,
    version: requirement.version,
    location,
    requirements: [],
  }
}

async function resolveGitHubSource(
  requirement: DependencyRequirement,
  identity: string,
  projectRoot: string,
  previous: LockedSource | undefined,
  update: boolean,
  options: DependencyStoreOptions,
): Promise<LockedSource> {
  if (requirement.provider !== 'github') {
    Errors.Throw('Expected GitHub dependency.')
  }
  const coordinates = githubCoordinates(requirement.identifier)
  const commit = previous?.commit && previous.version === requirement.version && !update
    ? previous.commit
    : await options.git.resolveCommit(coordinates.repository, requirement.version)
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(commit)) {
    preparationNeeded(`GitHub source ${identity} did not resolve to an immutable commit ID.`)
  }
  const root = Path.resolve(options.storeRoot ?? Path.join(projectRoot, '.tao', 'cache', 'dependencies'))
  const cacheLocation = Path.join(root, 'github', safeName(coordinates.repository), commit)
  await materializeGitHubCache(coordinates.repository, commit, cacheLocation, options)
  const location = await githubProjectLocation(requirement, identity, coordinates.subdirectory, cacheLocation)
  requireProjectRoot(location, `GitHub source ${identity}`)
  return {
    identity,
    provider: 'github',
    identifier: requirement.identifier,
    version: requirement.version,
    commit,
    subdirectory: normalizedSubdirectory(requirement.subdirectory ?? coordinates.subdirectory),
    location,
    requirements: [],
  }
}

async function materializeGitHubCache(
  repository: string,
  commit: string,
  cacheLocation: string,
  options: DependencyStoreOptions,
): Promise<void> {
  if (await FileSystem.exists(cacheLocation)) {
    return
  }
  await FileSystem.mkdir(Path.dirname(cacheLocation), { recursive: true })
  const pending = `${cacheLocation}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await options.git.fetchCommit(repository, commit, pending)
    await FileSystem.rename(pending, cacheLocation)
  }, { finally: () => FileSystem.rm(pending, { recursive: true, force: true }) })
}

async function githubProjectLocation(
  requirement: DependencyRequirement,
  identity: string,
  sourceSubdirectory: string | undefined,
  cacheLocation: string,
): Promise<string> {
  if (requirement.provider !== 'github') {
    Errors.Throw('Expected GitHub dependency.')
  }
  const requested = requirement.subdirectory ?? sourceSubdirectory
  const subdirectory = normalizedSubdirectory(requested)
  if (requested && !subdirectory) {
    preparationNeeded(`GitHub source ${identity} has an invalid project subdirectory.`)
  }
  const location = subdirectory ? Path.resolve(cacheLocation, ...subdirectory.split('/')) : cacheLocation
  if (subdirectory && !Path.isWithin(cacheLocation, location)) {
    preparationNeeded(`GitHub source ${identity} has an invalid project subdirectory.`)
  }
  if (!await FileSystem.exists(location)) {
    preparationNeeded(`GitHub source ${identity} has no project at ${subdirectory}.`)
  }
  return location
}

function normalizedSubdirectory(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  const normalized = value.replaceAll('\\', '/')
  return normalized.startsWith('/') || normalized.split('/').some(part => ['..', '.', ''].includes(part))
    ? undefined
    : normalized
}

function githubCoordinates(identifier: string): { repository: string; subdirectory?: string } {
  const normalized = identifier.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  const [owner, name, ...subdirectory] = normalized.split('/')
  if (!owner || !name || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    Errors.ThrowUserInput(`Invalid GitHub dependency identifier ${identifier}.`)
  }
  return {
    repository: `https://github.com/${owner}/${name}.git`,
    ...(subdirectory.length ? { subdirectory: subdirectory.join('/') } : {}),
  }
}

function safeName(repository: string): string {
  return repository.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replaceAll('/', '--')
}
