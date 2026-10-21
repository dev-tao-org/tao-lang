import { Errors, Try } from '@shared'
import { FileSystem, Path, SessionLock } from '@shared/os'
import { requireSetup } from '../SetupRequired'
import {
  dependencyLockPath,
  materializeLocations,
  materializeSources,
  readDependencyLock,
  writeDependencyLock,
} from './LockFile'
import { defaultSourceAlias, resolveSource, sourceIdentity } from './Sources'
import type { DependencyLock, DependencyRequirement, DependencyStoreOptions, LockedSource } from './Types'

/** resolveLockedAlias maps an import alias to its producing source root. */
export function resolveLockedAlias(
  lock: DependencyLock,
  importerRoot: string,
  alias: string,
  projectRoot: string,
): LockedSource | undefined {
  const owner = Path.resolve(importerRoot) === Path.resolve(projectRoot)
    ? undefined
    : Object.values(lock.sources).find(source => Path.resolve(source.location) === Path.resolve(importerRoot))
  if (owner && !owner.requirements.some(item => (item.alias ?? defaultSourceAlias(item)) === alias)) {
    return undefined
  }
  const requirement = owner?.requirements.find(item => (item.alias ?? defaultSourceAlias(item)) === alias)
  const identity = requirement ? sourceIdentity(requirement, owner!.location, projectRoot) : rootIdentity(lock, alias)
  return identity ? lock.sources[identity] : undefined
}

/** prepareDependencies resolves requirements and downloads only missing pinned Git sources. */
export async function prepareDependencies(
  projectRoot: string,
  requirements: DependencyRequirement[],
  options: DependencyStoreOptions,
  update: string[] | undefined = [],
): Promise<DependencyLock> {
  const path = dependencyLockPath(projectRoot)
  await FileSystem.mkdir(Path.dirname(path), { recursive: true })
  const lockPath = Path.join(projectRoot, '.tao', 'locks', 'dependencies.lock')
  await FileSystem.mkdir(Path.dirname(lockPath), { recursive: true })
  const lock = await (options.acquireLock ?? SessionLock.acquire)(lockPath)
  if (!lock) {
    preparationNeeded('Another Tao dependency preparation is running; retry.')
  }
  return await Try(async () => {
    const previous = await readDependencyLock(path)
    const sources = await resolveGraph(
      projectRoot,
      requirements,
      materializeSources(previous?.sources ?? {}, projectRoot, options.bundledProjects),
      previousPins(previous, projectRoot, options.bundledProjects),
      update,
      options,
    )
    const result: DependencyLock = {
      version: 1,
      roots: rootsFor(requirements, projectRoot),
      sources,
      ...(previous?.npmGraphs ? { npmGraphs: previous.npmGraphs } : {}),
    }
    await writeDependencyLock(path, result, projectRoot)
    return result
  }, { finally: () => lock.release() })
}

/** prepareSourceDependency materializes only an alias reached by entry resolution, retaining existing pins. */
export async function prepareSourceDependency(
  projectRoot: string,
  owner: string,
  alias: string,
  options: DependencyStoreOptions,
): Promise<{ root: string }> {
  const requirements = await options.readRequirements(owner)
  const requirement = requirements.find(item => (item.alias ?? defaultSourceAlias(item)) === alias)
    ?? Errors.ThrowUserInput(`Project ${owner} has no declared dependency alias ${alias}.`)
  const path = dependencyLockPath(projectRoot)
  const previous = materializeLocations(await readDependencyLock(path), projectRoot, options.bundledProjects)
    ?? { version: 1 as const, roots: {}, sources: {} }
  const identity = sourceIdentity(requirement, owner, projectRoot)
  const source = await resolveSource(
    requirement,
    identity,
    projectRoot,
    owner,
    previous.sources[identity],
    false,
    options,
  )
  const result = {
    ...previous,
    roots: Path.resolve(owner) === Path.resolve(projectRoot)
      ? { ...previous.roots, [alias]: `${identity}@${requirement.version}` }
      : previous.roots,
    sources: {
      ...previous.sources,
      [identity]: { ...source, requirements: await options.readRequirements(source.location) },
    },
  }
  await FileSystem.mkdir(Path.dirname(path), { recursive: true })
  await writeDependencyLock(path, result, projectRoot)
  return { root: source.location }
}

function rootIdentity(lock: DependencyLock, alias: string): string | undefined {
  const pin = lock.roots[alias]
  if (!pin) {
    return undefined
  }
  const separator = pin.lastIndexOf('@')
  const identity = separator > 0 ? pin.slice(0, separator) : undefined
  return identity && lock.sources[identity] ? identity : undefined
}

async function resolveGraph(
  projectRoot: string,
  requirements: DependencyRequirement[],
  previousSources: Record<string, LockedSource>,
  previousPins: Map<string, string>,
  update: string[],
  options: DependencyStoreOptions,
): Promise<Record<string, LockedSource>> {
  const sources: Record<string, LockedSource> = {}
  const pending = requirements.map(requirement => ({ requirement, parent: projectRoot }))
  const visited = new Set<string>()
  const resolvedPins = new Map<string, string>()
  while (pending.length > 0) {
    const { requirement, parent } = pending.shift()!
    const identity = sourceIdentity(requirement, parent, projectRoot)
    const requestedVersionPin = previousPins.get(`${identity}@${requirement.version}`)
    const sourcePin = previousSources[identity]
    const prior = requestedVersionPin && sourcePin?.commit
      ? { ...sourcePin, version: requirement.version, commit: requestedVersionPin }
      : sourcePin
    const pin = await resolveSource(
      requirement,
      identity,
      projectRoot,
      parent,
      prior,
      update?.includes(requirement.alias ?? defaultSourceAlias(requirement)) === true
        || update?.includes(identity) === true,
      options,
    )
    rejectCommitConflict(identity, pin.commit, resolvedPins)
    sources[identity] = { ...pin, identity, requirements: await options.readRequirements(pin.location) }
    const visitKey = `${identity}@${pin.commit ?? pin.version}`
    if (visited.has(visitKey)) {
      continue
    }
    visited.add(visitKey)
    for (const child of sources[identity]!.requirements) {
      pending.push({ requirement: child, parent: pin.location })
    }
  }
  return sources
}

function previousPins(
  previous: DependencyLock | undefined,
  projectRoot: string,
  bundledProjects?: Readonly<Record<string, string>>,
): Map<string, string> {
  const pins = new Map<string, string>()
  if (!previous) {
    return pins
  }
  const sources = materializeSources(previous.sources, projectRoot, bundledProjects)
  for (const value of Object.values(previous.roots)) {
    const split = value.lastIndexOf('@')
    const identity = split > 0 ? value.slice(0, split) : ''
    const version = split > 0 ? value.slice(split + 1) : ''
    const commit = sources[identity]?.commit
    if (identity && version && commit) {
      pins.set(`${identity}@${version}`, commit)
    }
  }
  for (const source of Object.values(sources)) {
    for (const requirement of source.requirements) {
      const identity = sourceIdentity(requirement, source.location, projectRoot)
      const commit = sources[identity]?.commit
      if (commit) {
        pins.set(`${identity}@${requirement.version}`, commit)
      }
    }
  }
  return pins
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

function rootsFor(requirements: DependencyRequirement[], projectRoot: string): Record<string, string> {
  return Object.fromEntries(
    requirements.map(requirement => [
      requirement.alias ?? defaultSourceAlias(requirement),
      `${sourceIdentity(requirement, projectRoot, projectRoot)}@${requirement.version}`,
    ]).sort(),
  )
}

function preparationNeeded(message: string): never {
  return requireSetup(message)
}
