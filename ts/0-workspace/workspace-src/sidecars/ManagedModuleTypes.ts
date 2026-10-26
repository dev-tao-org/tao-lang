import type { ManagedGraphReference } from '../dependencies/Types'

/** ManagedModuleRequirement pins one npm package to the declaration that owns it. */
export type ManagedModuleRequirement = { name: string; version: string; origin: string }

/** NormalizedManagedRequirement retains declaration ownership while ordering requirements across modules. */
export type NormalizedManagedRequirement = ManagedModuleRequirement & { directory: string }

/** ManagedModulesInput describes the reachable Tao modules and app runtime policy. */
export type ManagedModulesInput = {
  directory: string
  modules: { directory: string; requirements: ManagedModuleRequirement[] }[]
  target: string
  runtimePins: Record<string, string>
  runtimePolicy?: ManagedRuntimePolicy
  bunVersion: string
  singletonPackages?: string[]
  hostIdentity?: { os: string; architecture: string }
  previousGraphReference?: ManagedGraphReference
}

/** ManagedRuntimePolicy carries the bundled runtime's exact resolution and install patches. */
export type ManagedRuntimePolicy = {
  patchedDependencies: Record<string, string>
  overrides: Record<string, string>
  patches: Record<string, string>
}

/** BunExecutor runs a pinned Bun command without exposing host process details to orchestration. */
export type BunExecutor = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<{ status: number; stdout: string; stderr: string }>

/** PreparedManagedModules identifies the validated app graph and its declaration fingerprint. */
export type PreparedManagedModules = {
  graphFingerprint: string
  fingerprint: string
  packageDirectory: string
  lockfile: string
  nativePackages: string[]
}
