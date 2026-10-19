import { Errors } from '@shared'
import { Path } from '@shared/os'
import { readPreparedDependencies, resolveLockedAlias } from './dependencies/Store'
import type { DependencyLock, DependencyStoreOptions } from './dependencies/Types'
import { nearestProjectRoot } from './modules/Paths'

/** ProjectDependencies reuses validated source graphs until their authored requirements change. */
export class ProjectDependencies {
  private current: DependencyLock = { version: 1, roots: {}, sources: {} }
  private signature: string | undefined

  constructor(readonly root: string, private readonly options: DependencyStoreOptions) {}

  /** refresh validates changed requirements without resolving remote versions on ordinary edits. */
  async refresh(): Promise<void> {
    const requirements = await this.options.readRequirements(this.root)
    const nested = await Promise.all(
      Object.values(this.current.sources).map(async source => [
        source.identity,
        await this.options.readRequirements(source.location),
      ]),
    )
    const signature = JSON.stringify({ requirements, nested })
    if (signature === this.signature) {
      return
    }
    if (this.signature !== undefined) {
      Errors.ThrowUserInput('Dependency graph changed. Run tao prepare, then restart preview.')
    }
    this.current = requirements.length === 0
      ? { version: 1, roots: {}, sources: {} }
      : await readPreparedDependencies(this.root, requirements, this.options)
    this.signature = JSON.stringify({
      requirements,
      nested: Object.values(this.current.sources).map(source => [source.identity, source.requirements]),
    })
  }

  /** resolveProject resolves imports in their producer's alias scope. */
  async resolveProject(importer: string, alias: string): Promise<{ root: string }> {
    const owner = nearestProjectRoot(Path.dirname(importer)) ?? this.root
    const source = resolveLockedAlias(this.current, owner, alias, this.root)
      ?? Errors.ThrowUserInput(`Project ${owner} has no dependency alias ${alias}. Declare it and run tao prepare.`)
    return { root: source.location }
  }

  /** sourceDirectories lists live dependency roots for workspace observation. */
  sourceDirectories(): string[] {
    return Object.values(this.current.sources).filter(source => source.provider !== 'github').map(source =>
      source.location
    )
  }
}
