import { Errors, Try } from '@shared'
import { FileSystem, Path, SessionLock } from '@shared/os'
import { requireSetup } from '../SetupRequired'
import * as LockFile from './LockFile'
import { createSourceIdentity, deriveDefaultSourceAlias, resolveSource } from './Sources'
import type { DependencyLock, DependencyRequirement, DependencyStoreOptions, LockedSource } from './Types'

/** resolveLockedAlias maps an import alias to its producing source root. */
export function resolveLockedAlias(
  lock: DependencyLock,
  importerRoot: string,
  alias: string,
  projectRoot: string,
): LockedSource | undefined {
  const requirement = resolveLockedRequirement(lock, importerRoot, alias, projectRoot)
  const identity = requirement
    ? createSourceIdentity(requirement, importerRoot, projectRoot)
    : resolveRootIdentity(lock, alias)
  return identity ? lock.sources[identity] : undefined
}

/** resolveLockedRequirement returns the durable requirement owned by one locked source. */
export function resolveLockedRequirement(
  lock: DependencyLock,
  importerRoot: string,
  alias: string,
  projectRoot: string,
): DependencyRequirement | undefined {
  if (Path.resolve(importerRoot) === Path.resolve(projectRoot)) {
    return undefined
  }
  const owner = Object.values(lock.sources).find(source => Path.resolve(source.location) === Path.resolve(importerRoot))
  return owner?.requirements.find(item => (item.alias ?? deriveDefaultSourceAlias(item)) === alias)
}

/** prepareDependencies resolves requirements and downloads only missing pinned Git sources. */
export async function prepareDependencies(
  projectRoot: string,
  requirements: DependencyRequirement[],
  options: DependencyStoreOptions,
  update: string[] | undefined = [],
): Promise<DependencyLock> {
  const path = LockFile.resolveDependencyLockPath(projectRoot)
  await FileSystem.mkdir(Path.dirname(path), { recursive: true })
  const lockPath = Path.join(projectRoot, '.tao', 'locks', 'dependencies.lock')
  await FileSystem.mkdir(Path.dirname(lockPath), { recursive: true })
  const lock = await (options.acquireLock ?? SessionLock.acquire)(lockPath)
  if (!lock) {
    preparationNeeded('Another Tao dependency preparation is running; retry.')
  }
  return await Try(async () => {
    const previous = await LockFile.readDependencyLock(path)
    const sources = await resolveGraph(
      projectRoot,
      requirements,
      LockFile.materializeSources(previous?.sources ?? {}, projectRoot, options.bundledProjects),
      collectPreviousPins(previous),
      update,
      options,
    )
    const result: DependencyLock = {
      version: 2,
      roots: createRootPins(requirements, projectRoot),
      sources: sources.sources,
      commitPins: sources.commitPins,
      ...(previous?.npmGraphs ? { npmGraphs: previous.npmGraphs } : {}),
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
  options: DependencyStoreOptions,
  resolvedPins: Map<string, string>,
): Promise<{ root: string }> {
  const requirements = await options.readRequirements(owner)
  const requirement = requirements.find(item => (item.alias ?? deriveDefaultSourceAlias(item)) === alias)
    ?? Errors.ThrowUserInput(`Project ${owner} has no declared dependency alias ${alias}.`)
  const path = LockFile.resolveDependencyLockPath(projectRoot)
  const previous =
    LockFile.materializeLocations(await LockFile.readDependencyLock(path), projectRoot, options.bundledProjects)
      ?? { version: 2 as const, roots: {}, sources: {}, commitPins: {} }
  const identity = createSourceIdentity(requirement, owner, projectRoot)
  const source = await resolveSource(
    requirement,
    identity,
    projectRoot,
    owner,
    resolveSourceForVersion(previous.sources[identity], previous.commitPins, identity, requirement.version),
    false,
    options,
  )
  rejectCommitConflict(identity, source.commit, resolvedPins)
  const result = {
    ...previous,
    roots: Path.resolve(owner) === Path.resolve(projectRoot)
      ? { ...previous.roots, [alias]: `${identity}@${requirement.version}` }
      : previous.roots,
    sources: {
      ...previous.sources,
      [identity]: { ...source, requirements: await options.readRequirements(source.location) },
    },
    commitPins: {
      ...previous.commitPins,
      ...(source.commit ? { [`${identity}@${requirement.version}`]: source.commit } : {}),
    },
  }
  await FileSystem.mkdir(Path.dirname(path), { recursive: true })
  await LockFile.writeDependencyLock(path, result, projectRoot)
  if (source.commit) {
    resolvedPins.set(identity, source.commit)
  }
  return { root: source.location }
}

function resolveRootIdentity(lock: DependencyLock, alias: string): string | undefined {
  const pin = lock.roots[alias]
  if (!pin) {
    return undefined
  }
  const separator = pin.lastIndexOf('@')
  const identity = separator > 0 ? pin.slice(0, separator) : undefined
  return identity && lock.sources[identity] ? identity : undefined
}

type ResolvedDependencyGraph = {
  sources: Record<string, LockedSource>
  commitPins: Record<string, string>
}

async function resolveGraph(
  projectRoot: string,
  requirements: DependencyRequirement[],
  previousSources: Record<string, LockedSource>,
  previousPins: Map<string, string>,
  update: string[],
  options: DependencyStoreOptions,
): Promise<ResolvedDependencyGraph> {
  const sources: Record<string, LockedSource> = {}
  const commitPins: Record<string, string> = {}
  const pending = requirements.map(requirement => ({ requirement, parent: projectRoot }))
  const visited = new Set<string>()
  const resolvedPins = new Map<string, string>()
  while (pending.length > 0) {
    const { requirement, parent } = pending.shift()!
    const identity = createSourceIdentity(requirement, parent, projectRoot)
    const requestedVersionPin = previousPins.get(`${identity}@${requirement.version}`)
    const sourcePin = previousSources[identity]
    const prior = requestedVersionPin && sourcePin?.commit
      ? { ...sourcePin, version: requirement.version, commit: requestedVersionPin }
      : undefined
    const pin = await resolveSource(
      requirement,
      identity,
      projectRoot,
      parent,
      prior,
      update?.includes(requirement.alias ?? deriveDefaultSourceAlias(requirement)) === true
        || update?.includes(identity) === true,
      options,
    )
    rejectCommitConflict(identity, pin.commit, resolvedPins)
    sources[identity] = { ...pin, identity, requirements: await options.readRequirements(pin.location) }
    if (pin.commit) {
      commitPins[`${identity}@${requirement.version}`] = pin.commit
    }
    const visitKey = `${identity}@${pin.commit ?? pin.version}`
    if (visited.has(visitKey)) {
      continue
    }
    visited.add(visitKey)
    for (const child of sources[identity]!.requirements) {
      pending.push({ requirement: child, parent: pin.location })
    }
  }
  return { sources, commitPins }
}

function collectPreviousPins(
  previous: DependencyLock | undefined,
): Map<string, string> {
  return new Map(Object.entries(previous?.commitPins ?? {}))
}

function resolveSourceForVersion(
  source: LockedSource | undefined,
  commitPins: Record<string, string>,
  identity: string,
  version: string,
): LockedSource | undefined {
  const commit = commitPins[`${identity}@${version}`]
  return source && commit ? { ...source, version, commit } : undefined
}

function rejectCommitConflict(identity: string, commit: string | undefined, resolvedPins: Map<string, string>): void {
  if (!commit) {
    return
  }
  const previous = resolvedPins.get(identity)
  if (previous && previous !== commit) {
    preparationNeeded(`Dependency ${identity} is required at conflicting commits.`)
  }
  resolvedPins.set(identity, commit)
}

function createRootPins(requirements: DependencyRequirement[], projectRoot: string): Record<string, string> {
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
