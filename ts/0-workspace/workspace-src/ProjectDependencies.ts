import { Json, Sort, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import type * as Typecheck from '@typecheck'
import { materializeLocations, readDependencyLock, resolveDependencyLockPath } from './dependencies/LockFile'
import { collectSourceRequirements, validateSourceRequirements } from './dependencies/Requirements'
import { createSourceIdentity, deriveDefaultSourceAlias } from './dependencies/Sources'
import { resolveLockedAlias, resolveLockedRequirement } from './dependencies/Store'
import type { DependencyLock, DependencyRequirement, DependencyStoreOptions } from './dependencies/Types'
import { findNearestProjectRoot } from './modules/Paths'
import { requireSetup } from './SetupRequired'

type ObservedSource = Pick<Typecheck.SourceModule, ObservedSourceField>

/** ProjectDependencies resolves reachable locked aliases and observes declarations through the parsed graph. */
export class ProjectDependencies {
  private current: DependencyLock = { version: 2, roots: {}, sources: {}, commitPins: {} }
  private readonly requirements = new Map<string, DependencyRequirement[]>()
  private readonly used = new Set<string>()

  constructor(readonly root: string, private readonly options: DependencyStoreOptions) {}

  /** refresh reads initial durable state; ordinary edits observe parsed inputs instead of rescanning requirements. */
  async refresh(): Promise<void> {
    this.current = materializeLocations(
      await readDependencyLock(resolveDependencyLockPath(this.root)),
      this.root,
      this.options.bundledProjects,
    ) ?? { version: 2, roots: {}, sources: {}, commitPins: {} }
    this.requirements.set(this.root, await this.options.readRequirements(this.root))
  }

  /** observeProjectSources detects complete dependency changes in normal resolution without linking root declarations.
   *  Invalid syntax never reaches this method; a new session after setup replaces established requirements. */
  observeProjectSources(owner: string, sources: readonly ObservedSource[]): void {
    const actual = sources.flatMap(source => collectSourceRequirements(source.document, source.path))
    validateSourceRequirements(actual)
    const expected = this.requirements.get(owner)
    if (!expected) {
      const known = owner === this.root || Object.values(this.options.bundledProjects ?? {}).includes(owner)
        || Object.values(this.current.sources).some(source => source.location === owner)
      if (!known) {
        requireSetup('Project source ownership changed; preview restart is required.')
      }
      return
    }
    if (createDependencySignature(actual) !== createDependencySignature(expected)) {
      requireEditableDependencyDeclarations(this.current, owner)
      requireSetup('Dependency declarations changed; setup and preview restart are required.')
    }
  }

  /** resolveProject validates only a requested alias without resolving versions or claiming source edit ownership. */
  async resolveProject(importer: string, alias: string): Promise<{ root: string }> {
    const owner = findNearestProjectRoot(Path.dirname(importer)) ?? this.root
    const requirements = this.requirements.get(owner) ?? await this.options.readRequirements(owner)
    this.requirements.set(owner, requirements)
    const requirement = requirements.find(item => (item.alias ?? deriveDefaultSourceAlias(item)) === alias)
    if (requirement === undefined) {
      UserInput.Fail(`Project ${owner} has no dependency alias ${alias}; declare the source requirement.`)
    }
    const source = resolveLockedAlias(this.current, owner, alias, this.root)
    if (source === undefined) {
      requireSetup(`Dependency ${alias} needs setup.`)
    }
    if (source.identity !== createSourceIdentity(requirement, owner, this.root)) {
      requireSetup(`Dependency ${alias} needs setup.`)
    }
    if (owner === this.root && this.current.roots[alias] !== `${source.identity}@${requirement.version}`) {
      requireSetup(`Dependency ${alias} needs setup.`)
    }
    const lockedRequirement = resolveLockedRequirement(this.current, owner, alias, this.root)
    if (owner !== this.root && lockedRequirement?.version !== requirement.version) {
      requireSetup(`Dependency ${alias} needs setup.`)
    }
    if (
      requirement.provider === 'github'
      && this.current.commitPins[`${source.identity}@${requirement.version}`] !== source.commit
    ) {
      requireSetup(`Dependency ${alias} needs setup.`)
    }
    if (!await FS.exists(source.location)) {
      requireSetup(`Locked source ${source.identifier}@${source.commit} is missing; setup restores its exact pin.`)
    }
    this.used.add(source.identity)
    if (!this.requirements.has(source.location)) {
      this.requirements.set(source.location, source.requirements)
    }
    return { root: source.location }
  }

  /** sourceDirectories lists only used live dependency roots for workspace observation. */
  sourceDirectories(): string[] {
    return [...this.used].flatMap(identity => {
      const source = this.current.sources[identity]!
      return source.provider === 'github' ? [] : [source.location]
    })
  }
}

type ObservedSourceField = 'path' | 'document'

function createDependencySignature(requirements: DependencyRequirement[]): string {
  const authoredRequirements = requirements.filter(item => item.provider !== 'bundled' || item.identifier !== 'tao')
  const serializedRequirements = authoredRequirements.map(serializeDependencyRequirement).sort(Sort.CompareStrings)
  return Json.Print(serializedRequirements, { prettyPrint: false })
}

function serializeDependencyRequirement(requirement: DependencyRequirement): string {
  return Json.Print(requirement, { prettyPrint: false })
}

function requireEditableDependencyDeclarations(lock: DependencyLock, owner: string): void {
  const pinnedRemote = Object.values(lock.sources).some(source =>
    source.location === owner && source.provider === 'github'
  )
  UserInput.Require(!pinnedRemote, 'Pinned remote dependency declarations changed; restore the exact pinned source.')
}
