import type { ManagedGraphReference } from '../dependencies/Types'

/** ManagedModuleRequirement pins one npm package to the declaration that owns it. */
export type ManagedModuleRequirement = { name: string; version: string; origin: string }

/** NormalizedManagedRequirement retains declaration ownership while ordering requirements across modules. */
export type NormalizedManagedRequirement = ManagedModuleRequirement & { directory: string }

/** SidecarCommandResult preserves a command's exit status and captured output. */
export type SidecarCommandResult = { status: number; stdout: string; stderr: string }

/** GeneratedModuleFileDrift identifies owned generated metadata that needs repair. */
export type GeneratedModuleFileDrift = { path: string; owner: string; repair: string }

/** ManagedRuntimePins maps package names to the exact runtime versions prepared for an app. */
export type ManagedRuntimePins = Record<string, string>

/** ManagedPackageVersionMap maps npm package names to their required version or resolution string. */
export type ManagedPackageVersionMap = Record<string, string>

type ManagedPatchFiles = Record<string, string>

/** ManagedModulesInput describes the reachable Tao modules and app runtime policy. */
export type ManagedModulesInput = {
  directory: string
  modules: { directory: string; requirements: ManagedModuleRequirement[] }[]
  target: string
  runtimePins: ManagedRuntimePins
  runtimePolicy?: ManagedRuntimePolicy
  bunVersion: string
  singletonPackages?: string[]
  hostIdentity?: { os: string; architecture: string }
  previousGraphReference?: ManagedGraphReference
}

/** ManagedRuntimePolicy carries the bundled runtime's exact resolution and install patches. */
export type ManagedRuntimePolicy = {
  patchedDependencies: ManagedPackageVersionMap
  overrides: ManagedPackageVersionMap
  patches: ManagedPatchFiles
}

/** BunExecutor runs a pinned Bun command without exposing host process details to orchestration. */
export type BunExecutor = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<SidecarCommandResult>

/** PreparedManagedModules identifies the validated app graph and its declaration fingerprint. */
export type PreparedManagedModules = {
  graphFingerprint: string
  fingerprint: string
  packageDirectory: string
  lockfile: string
  nativePackages: string[]
}
