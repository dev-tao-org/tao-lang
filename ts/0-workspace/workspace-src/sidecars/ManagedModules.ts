import { cleanManagedModuleMetadata } from './ManagedModuleCleanup'
import * as ManagedModuleMetadata from './ManagedModuleMetadata'
import type { BunExecutor, ManagedModulesInput, PreparedManagedModules } from './ManagedModuleTypes'
import { prepareManagedModules as prepareProfile, readManagedModules as readProfile } from './ManagedNpmProfile'

export type * from './ManagedModuleTypes'

export { cleanManagedModuleMetadata }

/** prepareManagedModules resolves an exact app-local npm graph and publishes module resolution links. */
export async function prepareManagedModules(
  input: ManagedModulesInput,
  executor: BunExecutor,
): Promise<PreparedManagedModules> {
  return await prepareProfile(input, executor)
}

/** readManagedModules validates declaration freshness before exposing installed module resolution. */
export async function readManagedModules(input: ManagedModulesInput): Promise<PreparedManagedModules> {
  return await readProfile(input)
}

/** inspectGeneratedModuleFiles reports generated module metadata drift with its declaration owner and repair command. */
export async function inspectGeneratedModuleFiles(
  input: ManagedModulesInput,
): Promise<{ path: string; owner: string; repair: string }[]> {
  const defaultsDrift = await ManagedModuleMetadata.typescriptDefaultsDrift(input.directory)
  if (defaultsDrift.length > 0) {
    return defaultsDrift
  }
  const managed = await readProfile(input)
  return await ManagedModuleMetadata.inspectGeneratedModuleFiles(input, managed)
}

/** repairManagedModuleFiles restores the app graph, generated module metadata, and package links. */
export async function repairManagedModuleFiles(
  input: ManagedModulesInput,
  executor: BunExecutor,
): Promise<PreparedManagedModules> {
  return await prepareProfile(input, executor, true)
}
