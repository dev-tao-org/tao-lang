/** DependencyRequirement describes one authored Tao source dependency. */
export type DependencyRequirement = {
  provider: DependencyProvider
  identifier: string
  version: string
  alias?: string
  subdirectory?: string
}

/** DependencyLock records immutable Git pins and live local source locations. */
export type DependencyLock = {
  version: 2
  roots: Record<string, string>
  sources: Record<string, LockedSource>
  commitPins: DependencyCommitPins
  npmGraphs?: Record<string, ManagedGraphReference>
}

/** DependencyCommitPins maps each Git source ref to its exact immutable commit. */
export type DependencyCommitPins = Record<string, string>

/** ManagedGraphReference pins one exact npm graph durable lock. */
export type ManagedGraphReference = { fingerprint: string; lockPath: string; lockHash: string }

/** LockedSource identifies a resolved producer and its dependency aliases. */
export type LockedSource = {
  identity: string
  provider: DependencyRequirement['provider']
  identifier: string
  version: string
  commit?: string
  subdirectory?: string
  location: string
  requirements: DependencyRequirement[]
}

/** GitSourceAdapter resolves refs and materializes exact immutable Git commits. */
export type GitSourceAdapter = {
  resolveCommit(repository: string, version: string): Promise<string>
  fetchCommit(repository: string, commit: string, destination: string): Promise<void>
}

/** DependencyStoreOptions supplies project storage and source discovery. */
export type DependencyStoreOptions = {
  storeRoot?: string
  readRequirements(root: string): Promise<DependencyRequirement[]>
  git: GitSourceAdapter
  bundledProjects?: Readonly<Record<string, string>>
  acquireLock?: (path: string) => Promise<DependencyLockLease | undefined>
}

type DependencyProvider = 'github' | 'file' | 'bundled'
type DependencyLockLease = { release(): void }
