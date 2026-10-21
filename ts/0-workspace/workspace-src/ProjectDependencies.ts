import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import { dependencyLockPath, materializeLocations, readDependencyLock } from './dependencies/LockFile'
import { sourceRequirements, validateSourceRequirements } from './dependencies/Requirements'
import { defaultSourceAlias, sourceIdentity } from './dependencies/Sources'
import { resolveLockedAlias } from './dependencies/Store'
import type { DependencyLock, DependencyRequirement, DependencyStoreOptions } from './dependencies/Types'
import { nearestProjectRoot } from './modules/Paths'
import { requireSetup } from './SetupRequired'

/** ProjectDependencies resolves reachable locked aliases and observes declarations through the parsed graph. */
export class ProjectDependencies {
  private current: DependencyLock = { version: 1, roots: {}, sources: {} }
  private readonly requirements = new Map<string, DependencyRequirement[]>()
  private readonly used = new Set<string>()

  constructor(readonly root: string, private readonly options: DependencyStoreOptions) {}

  /** refresh reads initial durable state; ordinary edits observe parsed inputs instead of rescanning requirements. */
  async refresh(): Promise<void> {
    this.current = materializeLocations(
      await readDependencyLock(dependencyLockPath(this.root)),
      this.root,
      this.options.bundledProjects,
    ) ?? { version: 1, roots: {}, sources: {} }
    this.requirements.set(this.root, await this.options.readRequirements(this.root))
  }

  /** observeProjectSources detects complete dependency changes in normal resolution without linking root declarations.
   *  Invalid syntax never reaches this method; a new session after setup replaces established requirements. */
  observeProjectSources(owner: string, sources: readonly Pick<SourceModule, 'path' | 'document'>[]): void {
    const actual = sources.flatMap(source => sourceRequirements(source.document.root.declarations, source.path))
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
    if (signature(actual) !== signature(expected)) {
      if (
        Object.values(this.current.sources).some(source => source.location === owner && source.provider === 'github')
      ) {
        Errors.ThrowUserInput('Pinned remote dependency declarations changed; restore the exact pinned source.')
      }
      requireSetup('Dependency declarations changed; setup and preview restart are required.')
    }
  }

  /** resolveProject validates only a requested alias without resolving versions or claiming source edit ownership. */
  async resolveProject(importer: string, alias: string): Promise<{ root: string }> {
    const owner = nearestProjectRoot(Path.dirname(importer)) ?? this.root
    const requirements = this.requirements.get(owner) ?? await this.options.readRequirements(owner)
    this.requirements.set(owner, requirements)
    const requirement = requirements.find(item => (item.alias ?? defaultSourceAlias(item)) === alias)
      ?? Errors.ThrowUserInput(`Project ${owner} has no dependency alias ${alias}; declare the source requirement.`)
    const source = resolveLockedAlias(this.current, owner, alias, this.root)
      ?? requireSetup(`Dependency ${alias} needs setup.`)
    if (source.identity !== sourceIdentity(requirement, owner, this.root) || source.version !== requirement.version) {
      requireSetup(`Dependency ${alias} needs setup.`)
    }
    if (!await FileSystem.exists(source.location)) {
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

function signature(requirements: DependencyRequirement[]): string {
  return JSON.stringify(
    requirements.filter(item => item.provider !== 'bundled' || item.identifier !== 'tao')
      .map(item => JSON.stringify(item)).sort(),
  )
}
