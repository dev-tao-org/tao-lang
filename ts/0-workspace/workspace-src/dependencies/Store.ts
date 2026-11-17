import { Try, UserInput } from '@shared'
import { FileLock, FS, Path } from '@shared/os'
import { requireSetup } from '../SetupRequired'
import { rejectCommitConflict, resolveDependencyGraph } from './DependencyGraph'
import * as LockFile from './LockFile'
import { createSourceIdentity, deriveDefaultSourceAlias, resolveSource } from './Sources'
import type * as Types from './Types'

/** resolveLockedAlias maps an import alias to its producing source root. */
export function resolveLockedAlias(
  lock: Types.DependencyLock,
  importerRoot: string,
  alias: string,
  projectRoot: string,
): Types.LockedSource | undefined {
  const requirement = resolveLockedRequirement(lock, importerRoot, alias, projectRoot)
  const identity = requirement
    ? createSourceIdentity(requirement, importerRoot, projectRoot)
    : resolveRootIdentity(lock, alias)
  return identity ? lock.sources[identity] : undefined
}

/** resolveLockedRequirement returns the durable requirement owned by one locked source. */
export function resolveLockedRequirement(
  lock: Types.DependencyLock,
  importerRoot: string,
  alias: string,
  projectRoot: string,
): Types.DependencyRequirement | undefined {
  if (Path.resolve(importerRoot) === Path.resolve(projectRoot)) {
    return undefined
  }
  const owner = Object.values(lock.sources).find(source => Path.resolve(source.location) === Path.resolve(importerRoot))
  return owner?.requirements.find(item => (item.alias ?? deriveDefaultSourceAlias(item)) === alias)
}

/** prepareDependencies resolves requirements and downloads only missing pinned Git sources. */
export async function prepareDependencies(
  projectRoot: string,
  requirements: Types.DependencyRequirement[],
  options: Types.DependencyStoreOptions,
  update: string[] = [],
): Promise<Types.DependencyLock> {
  const path = LockFile.resolveDependencyLockPath(projectRoot)
  await FS.mkdir(Path.dirname(path))
  const lockPath = Path.join(projectRoot, '.tao', 'locks', 'dependencies.lock')
  await FS.mkdir(Path.dirname(lockPath))
  const acquireLock = options.acquireLock ?? FileLock.tryAcquire
  const lock = await acquireLock(lockPath)
  if (!lock) {
    preparationNeeded('Another Tao dependency preparation is running; retry.')
  }
  return await Try(async () => {
    const previous = await LockFile.readDependencyLock(path)
    const previousSources = LockFile.materializeSources(previous?.sources ?? {}, projectRoot, options.bundledProjects)
    const previousPins = new Map(Object.entries(previous?.commitPins ?? {}))
    const sources = await resolveDependencyGraph(
      projectRoot,
      requirements,
      previousSources,
      previousPins,
      update,
      options,
    )
    const roots = createRootPins(requirements, projectRoot)
    const retainedNpmGraphs = previous?.npmGraphs ? { npmGraphs: previous.npmGraphs } : {}
    const result: Types.DependencyLock = {
      version: 2,
      roots,
      sources: sources.sources,
      commitPins: sources.commitPins,
      ...retainedNpmGraphs,
    }
    await LockFile.writeDependencyLock(path, result, projectRoot)
    return result
  }, { finally: () => lock.release() })
}

/** prepareSourceDependency materializes only an alias reached by entry resolution, retaining existing pins. */
export async function prepareSourceDependency(
  projectRoot: string,
  owner: string,
  alias: string,
  options: Types.DependencyStoreOptions,
  resolvedPins: Map<string, string>,
): Promise<{ root: string }> {
  const requirements = await options.readRequirements(owner)
  const requirement = requirements.find(item => (item.alias ?? deriveDefaultSourceAlias(item)) === alias)
  if (requirement === undefined) {
    UserInput.fail(`Project ${owner} has no declared dependency alias ${alias}.`)
  }
  const path = LockFile.resolveDependencyLockPath(projectRoot)
  const storedLock = LockFile.materializeLocations(
    await LockFile.readDependencyLock(path),
    projectRoot,
    options.bundledProjects,
  )
  const previous = storedLock === undefined
    ? { version: 2 as const, roots: {}, sources: {}, commitPins: {} }
    : storedLock
  const identity = createSourceIdentity(requirement, owner, projectRoot)
  const previousSource = resolveSourceForVersion(
    previous.sources[identity],
    previous.commitPins,
    identity,
    requirement.version,
  )
  const source = await resolveSource(
    requirement,
    identity,
    projectRoot,
    owner,
    previousSource,
    false,
    options,
  )
  rejectCommitConflict(identity, source.commit, resolvedPins)
  const sourceRequirements = await options.readRequirements(source.location)
  const resolvedSource = { ...source, requirements: sourceRequirements }
  const result = overlayPreparedSource(previous, resolvedSource, requirement, { projectRoot, owner, alias, identity })
  await FS.mkdir(Path.dirname(path))
  await LockFile.writeDependencyLock(path, result, projectRoot)
  if (source.commit) {
    resolvedPins.set(identity, source.commit)
  }
  return { root: source.location }
}

function resolveRootIdentity(lock: Types.DependencyLock, alias: string): string | undefined {
  const pin = lock.roots[alias]
  if (!pin) {
    return undefined
  }
  const separator = pin.lastIndexOf('@')
  const identity = separator > 0 ? pin.slice(0, separator) : undefined
  return identity && lock.sources[identity] ? identity : undefined
}

type PreviousLockedSource = Types.LockedSource | undefined

type SourcePreparationContext = { projectRoot: string; owner: string; alias: string; identity: string }

function overlayPreparedSource(
  previous: Types.DependencyLock,
  source: Types.LockedSource,
  requirement: Types.DependencyRequirement,
  context: SourcePreparationContext,
): Types.DependencyLock {
  const roots = overlayRootPin(previous.roots, requirement, context)
  const sources = { ...previous.sources, [context.identity]: source }
  const commitPins = overlayCommitPin(previous.commitPins, source, requirement, context.identity)
  return { ...previous, roots, sources, commitPins }
}

function overlayRootPin(
  previous: Types.DependencyRootPins,
  requirement: Types.DependencyRequirement,
  context: SourcePreparationContext,
): Types.DependencyRootPins {
  const isRootOwner = Path.resolve(context.owner) === Path.resolve(context.projectRoot)
  if (!isRootOwner) {
    return previous
  }
  const requestedPin = `${context.identity}@${requirement.version}`
  return { ...previous, [context.alias]: requestedPin }
}

function overlayCommitPin(
  previous: Types.DependencyCommitPins,
  source: Types.LockedSource,
  requirement: Types.DependencyRequirement,
  identity: string,
): Types.DependencyCommitPins {
  const requestedPin = `${identity}@${requirement.version}`
  const resolvedPin = source.commit ? { [requestedPin]: source.commit } : {}
  return { ...previous, ...resolvedPin }
}

function resolveSourceForVersion(
  source: PreviousLockedSource,
  commitPins: Types.DependencyCommitPins,
  identity: string,
  version: string,
): Types.LockedSource | undefined {
  const commit = commitPins[`${identity}@${version}`]
  return source && commit ? { ...source, version, commit } : undefined
}

function createRootPins(requirements: Types.DependencyRequirement[], projectRoot: string): Types.DependencyRootPins {
  return Object.fromEntries(
    requirements.map(requirement => [
      requirement.alias ?? deriveDefaultSourceAlias(requirement),
      `${createSourceIdentity(requirement, projectRoot, projectRoot)}@${requirement.version}`,
    ]).sort(),
  )
}

function preparationNeeded(message: string): never {
  return requireSetup(message)
}
