/** ManagedModuleRequirement pins one npm package to the declaration that owns it. */
export type ManagedModuleRequirement = { name: string; version: string; origin: string }

/** ManagedModulesInput describes the reachable Tao modules and app runtime policy. */
export type ManagedModulesInput = {
  directory: string
  modules: { directory: string; requirements: ManagedModuleRequirement[] }[]
  target: string
  runtimePins: Record<string, string>
  bunVersion: string
  singletonPackages?: string[]
  hostIdentity?: { os: string; architecture: string }
}

/** BunExecutor runs a pinned Bun command without exposing host process details to orchestration. */
export type BunExecutor = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<{ status: number; stdout: string; stderr: string }>

/** PreparedManagedModules identifies the validated app graph and its declaration fingerprint. */
export type PreparedManagedModules = {
  fingerprint: string
  packageDirectory: string
  lockfile: string
  nativePackages: string[]
}
