import { cleanManagedModuleMetadata } from './ManagedModuleCleanup'
import * as ManagedModuleMetadata from './ManagedModuleMetadata'
import * as ManagedModuleTypes from './ManagedModuleTypes'
import { prepareManagedModules as prepareProfile, readManagedModules as readProfile } from './ManagedNpmProfile'

type PrepareManagedModules = (
  input: ManagedModuleTypes.ManagedModulesInput,
  executor: ManagedModuleTypes.BunExecutor,
) => Promise<ManagedModuleTypes.PreparedManagedModules>
type ReadManagedModules = (
  input: ManagedModuleTypes.ManagedModulesInput,
) => Promise<ManagedModuleTypes.PreparedManagedModules>

export type * from './ManagedModuleTypes'

export { cleanManagedModuleMetadata }

/** prepareManagedModules resolves an exact app-local npm graph and publishes module resolution links. */
export const prepareManagedModules: PrepareManagedModules = prepareProfile

/** readManagedModules validates declaration freshness before exposing installed module resolution. */
export const readManagedModules: ReadManagedModules = readProfile

/** inspectGeneratedModuleFiles reports generated module metadata drift with its declaration owner and repair command. */
export async function inspectGeneratedModuleFiles(
  input: ManagedModuleTypes.ManagedModulesInput,
): Promise<ManagedModuleTypes.GeneratedModuleFileDrift[]> {
  const defaultsDrift = await ManagedModuleMetadata.typescriptDefaultsDrift(input.directory)
  if (defaultsDrift.length > 0) {
    return defaultsDrift
  }
  const managed = await readProfile(input)
  return await ManagedModuleMetadata.inspectGeneratedModuleFiles(input, managed)
}

/** repairManagedModuleFiles restores the app graph, generated module metadata, and package links. */
export async function repairManagedModuleFiles(
  input: ManagedModuleTypes.ManagedModulesInput,
  executor: ManagedModuleTypes.BunExecutor,
): Promise<ManagedModuleTypes.PreparedManagedModules> {
  return await prepareProfile(input, executor, true)
}
