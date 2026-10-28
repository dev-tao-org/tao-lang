import { requireSetup } from '../SetupRequired'
import { createSourceIdentity, deriveDefaultSourceAlias, resolveSource } from './Sources'
import type * as Types from './Types'

/** resolveDependencyGraph resolves queued source requirements before expanding each unique producer. */
export async function resolveDependencyGraph(
  projectRoot: string,
  requirements: Types.DependencyRequirement[],
  previousSources: Types.DependencySources,
  previousPins: Map<string, string>,
  update: string[],
  options: Types.DependencyStoreOptions,
): Promise<ResolvedDependencyGraph> {
  const graph: ResolvedDependencyGraph = { sources: {}, commitPins: {} }
  const pending = requirements.map(requirement => ({ requirement, parent: projectRoot }))
  const visited = new Set<string>()
  const resolvedPins = new Map<string, string>()
  while (pending.length > 0) {
    const request = pending.shift()!
    const identity = createSourceIdentity(request.requirement, request.parent, projectRoot)
    const prior = resolvePreviousSource(request.requirement, identity, previousSources, previousPins)
    const shouldUpdate = isRequestedSourceUpdate(request.requirement, identity, update)
    const pin = await resolveSource(
      request.requirement,
      identity,
      projectRoot,
      request.parent,
      prior,
      shouldUpdate,
      options,
    )
    rejectCommitConflict(identity, pin.commit, resolvedPins)
    const requirements = await options.readRequirements(pin.location)
    const source = { ...pin, identity, requirements }
    recordResolvedSource(graph, source, request.requirement)
    enqueueUnvisitedRequirements(source, pending, visited)
  }
  return graph
}

/** rejectCommitConflict requires every occurrence of a source identity to resolve to one commit. */
export function rejectCommitConflict(
  identity: string,
  commit: OptionalCommit,
  resolvedPins: Map<string, string>,
): void {
  if (!commit) {
    return
  }
  const previous = resolvedPins.get(identity)
  if (previous && previous !== commit) {
    requireSetup(`Dependency ${identity} is required at conflicting commits.`)
  }
  resolvedPins.set(identity, commit)
}

type OptionalCommit = string | undefined
type PreviousLockedSource = Types.LockedSource | undefined
type DependencyRequest = { requirement: Types.DependencyRequirement; parent: string }
type ResolvedDependencyGraph = { sources: Types.DependencySources; commitPins: Types.DependencyCommitPins }

function resolvePreviousSource(
  requirement: Types.DependencyRequirement,
  identity: string,
  previousSources: Types.DependencySources,
  previousPins: Map<string, string>,
): PreviousLockedSource {
  const requestedVersionPin = previousPins.get(`${identity}@${requirement.version}`)
  const sourcePin = previousSources[identity]
  return requestedVersionPin && sourcePin?.commit
    ? { ...sourcePin, version: requirement.version, commit: requestedVersionPin }
    : undefined
}

function isRequestedSourceUpdate(
  requirement: Types.DependencyRequirement,
  identity: string,
  update: string[],
): boolean {
  const alias = requirement.alias ?? deriveDefaultSourceAlias(requirement)
  const updatesAlias = update?.includes(alias) === true
  if (updatesAlias) {
    return true
  }
  const updatesIdentity = update?.includes(identity) === true
  return updatesIdentity
}

function recordResolvedSource(
  graph: ResolvedDependencyGraph,
  source: Types.LockedSource,
  requirement: Types.DependencyRequirement,
): void {
  graph.sources[source.identity] = source
  if (source.commit) {
    const requestedPin = `${source.identity}@${requirement.version}`
    graph.commitPins[requestedPin] = source.commit
  }
}

function enqueueUnvisitedRequirements(
  source: Types.LockedSource,
  pending: DependencyRequest[],
  visited: Set<string>,
): void {
  const visitKey = `${source.identity}@${source.commit ?? source.version}`
  if (visited.has(visitKey)) {
    return
  }
  visited.add(visitKey)
  for (const requirement of source.requirements) {
    pending.push({ requirement, parent: source.location })
  }
}
