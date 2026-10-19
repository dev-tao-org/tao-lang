import { Errors, Try } from '@shared'
import { FileSystem, Path, SessionLock } from '@shared/os'
import {
  dependencyLockPath,
  materializeLocations,
  materializeSources,
  readDependencyLock,
  writeDependencyLock,
} from './LockFile'
import { assertTaoProjectRoot, defaultSourceAlias, resolveSource, sourceIdentity } from './Sources'
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

function rootIdentity(lock: DependencyLock, alias: string): string | undefined {
  const pin = lock.roots[alias]
  if (!pin) {
    return undefined
  }
  const separator = pin.lastIndexOf('@')
  const identity = separator > 0 ? pin.slice(0, separator) : undefined
  return identity && lock.sources[identity] ? identity : undefined
}

/** readPreparedDependencies reads a matching durable lock without fetching remote sources. */
export async function readPreparedDependencies(
  projectRoot: string,
  requirements: DependencyRequirement[],
  options: DependencyStoreOptions,
): Promise<DependencyLock> {
  const lock = materializeLocations(await readDependencyLock(dependencyLockPath(projectRoot)), projectRoot)
  const expected = rootsFor(requirements, projectRoot)
  if (!lock || JSON.stringify(lock.roots) !== JSON.stringify(expected)) {
    preparationNeeded('Dependencies changed; prepare dependencies, then retry.')
  }
  for (const source of Object.values(lock.sources)) {
    if (!await FileSystem.exists(source.location)) {
      preparationNeeded(
        `Locked source ${source.identifier}@${source.commit} is missing; prepare dependencies, then retry.`,
      )
    }
    assertTaoProjectRoot(source.location, `Locked source ${source.identifier}`)
    const current = await options.readRequirements(source.location)
    if (JSON.stringify(normalizeRequirements(current)) !== JSON.stringify(normalizeRequirements(source.requirements))) {
      preparationNeeded(
        `Requirements changed in ${source.identifier}; prepare dependencies, then retry.`,
      )
    }
  }
  return lock
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
      materializeSources(previous?.sources ?? {}, projectRoot),
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

async function resolveGraph(
  projectRoot: string,
  requirements: DependencyRequirement[],
  previousSources: Record<string, LockedSource>,
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
    const pin = await resolveSource(
      requirement,
      identity,
      projectRoot,
      parent,
      previousSources[identity],
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

function normalizeRequirements(requirements: DependencyRequirement[]): string[] {
  return requirements.map(requirement => JSON.stringify(requirement)).sort()
}

function preparationNeeded(message: string): never {
  Errors.ThrowUserInput(message)
}
