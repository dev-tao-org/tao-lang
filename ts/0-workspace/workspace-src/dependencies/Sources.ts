import { Errors, Regxs, Switch, Try, UserInput } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import type { DependencyRequirement, DependencyStoreOptions, LockedSource } from './Types'

/** deriveDefaultSourceAlias chooses an import alias from the source identifier. */
export function deriveDefaultSourceAlias(requirement: DependencyRequirement): string {
  return requirement.provider === 'github'
    ? githubIdentifierPath(requirement.identifier).split('/').at(-1)!
    : Path.basename(requirement.identifier.replaceAll('\\', '/'))
}

/** createSourceIdentity identifies a producer independently from its consumer alias. */
export function createSourceIdentity(requirement: DependencyRequirement, parent: string, projectRoot: string): string {
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
  previous: PreviousSource,
  update: boolean,
  options: DependencyStoreOptions,
): Promise<LockedSource> {
  return await Switch.property(requirement, 'provider', {
    file: () => resolveFileSource(requirement, identity, parent),
    bundled: async () => resolveBundledSource(requirement, identity, options),
    github: () => resolveGitHubSource(requirement, identity, projectRoot, previous, update, options),
  })
}

type PreviousSource = LockedSource | undefined
type OptionalSubdirectory = string | undefined

function preparationNeeded(message: string): never {
  UserInput.Fail(message)
}

function canonicalFileSource(parent: string, identifier: string): string {
  const path = Path.isAbsolute(identifier) ? identifier : Path.resolve(parent, identifier)
  return Try.WithDefault(path, () => FS.realpathSync(path))
}

function requireProjectRoot(location: string, label: string): void {
  const marker = Path.join(location, '.tao')
  const valid = Try.WithDefault(false, () => FS.lstatSync(location).isDirectory())
    && Try.WithDefault(false, () => FS.lstatSync(marker).isDirectory())
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
  if (!await FS.exists(sourcePath)) {
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
  if (root === undefined) {
    preparationNeeded(`Bundled project ${requirement.identifier} is unavailable; prepare dependencies, then retry.`)
  }
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
  previous: PreviousSource,
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
  if (!Regxs.GitCommitHashRegx.test(commit)) {
    preparationNeeded(`GitHub source ${identity} did not resolve to an immutable commit ID.`)
  }
  const root = Path.resolve(options.storeRoot ?? Path.join(projectRoot, '.tao', 'cache', 'dependencies'))
  const cacheLocation = Path.join(root, 'github', githubCacheName(coordinates.repository), commit)
  await materializeGitHubCache(coordinates.repository, commit, cacheLocation, options)
  const location = await githubProjectLocation(requirement, identity, coordinates.subdirectory, cacheLocation)
  requireProjectRoot(location, `GitHub source ${identity}`)
  return {
    identity,
    provider: 'github',
    identifier: requirement.identifier,
    version: requirement.version,
    commit,
    subdirectory: normalizeSubdirectory(requirement.subdirectory ?? coordinates.subdirectory),
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
  if (await FS.exists(cacheLocation)) {
    return
  }
  await FS.mkdir(Path.dirname(cacheLocation))
  const pending = `${cacheLocation}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await options.git.fetchCommit(repository, commit, pending)
    await FS.rename(pending, cacheLocation)
  }, { finally: () => FS.rm(pending, { recursive: true, force: true }) })
}

async function githubProjectLocation(
  requirement: DependencyRequirement,
  identity: string,
  sourceSubdirectory: OptionalSubdirectory,
  cacheLocation: string,
): Promise<string> {
  if (requirement.provider !== 'github') {
    Errors.Throw('Expected GitHub dependency.')
  }
  const requested = requirement.subdirectory ?? sourceSubdirectory
  const subdirectory = normalizeSubdirectory(requested)
  if (requested && !subdirectory) {
    preparationNeeded(`GitHub source ${identity} has an invalid project subdirectory.`)
  }
  const location = subdirectory ? Path.resolve(cacheLocation, ...subdirectory.split('/')) : cacheLocation
  if (subdirectory && !Path.isWithin(cacheLocation, location)) {
    preparationNeeded(`GitHub source ${identity} has an invalid project subdirectory.`)
  }
  if (!await FS.exists(location)) {
    preparationNeeded(`GitHub source ${identity} has no project at ${subdirectory}.`)
  }
  return location
}

function normalizeSubdirectory(value: OptionalSubdirectory): string | undefined {
  if (!value) {
    return undefined
  }
  const normalized = value.replaceAll('\\', '/')
  // ex: ui/forms -> ui/forms | ex: ../forms -> undefined
  return normalized.startsWith('/') || normalized.split('/').some(part => ['..', '.', ''].includes(part))
    ? undefined
    : normalized
}

function githubCoordinates(identifier: string): { repository: string; subdirectory?: string } {
  const normalized = githubIdentifierPath(identifier).replace(Regxs.TrailingSlashRegx, '')
  // ex: x/foo/ui/forms -> owner x, name foo, subdirectory [ui, forms]
  const [owner, name, ...subdirectory] = normalized.split('/')
  if (!owner || !name) {
    UserInput.Fail(`Invalid GitHub dependency identifier ${identifier}.`)
  }
  if (!Regxs.GithubCoordinateRegx.test(owner) || !Regxs.GithubCoordinateRegx.test(name)) {
    UserInput.Fail(`Invalid GitHub dependency identifier ${identifier}.`)
  }
  return {
    repository: `https://github.com/${owner}/${name}.git`,
    ...(subdirectory.length ? { subdirectory: subdirectory.join('/') } : {}),
  }
}

function githubCacheName(repository: string): string {
  // ex: https://github.com/x/foo.git -> x--foo
  return githubIdentifierPath(repository).replaceAll('/', '--')
}

function githubIdentifierPath(identifier: string): string {
  // ex: https://github.com/x/foo.git -> x/foo
  return identifier.replace(Regxs.GithubRepositoryUrlPrefixRegx, '').replace(Regxs.GitSuffixRegx, '')
}
