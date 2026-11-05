import * as Runtime from '@runtime'
import { Json, NewlineCharacter, NullCharacter, Sort } from '@shared'
import { Path, Platform } from '@shared/os'
import { collectAllRequirements } from '../ManagedModule/ManagedModuleGraph'
import { typeScriptDefaultsHash } from '../ManagedModule/ManagedModuleMetadata'
import * as ManagedModuleTypes from '../ManagedModule/ManagedModuleTypes'
import { installHostIdentity } from './ManagedNpmHost'
import * as ManagedNpmPolicy from './ManagedNpmPolicy'

/** normalizeManagedRequirements sorts declaration inputs by ordinal UTF-16 code-unit order. */
export function normalizeManagedRequirements(
  input: ManagedModuleTypes.ManagedModulesInput,
): ManagedModuleTypes.NormalizedManagedRequirement[] {
  return input.modules.flatMap(module =>
    module.requirements.map(requirement => ({
      directory: module.directory,
      name: requirement.name,
      version: requirement.version,
      origin: requirement.origin,
    }))
  ).sort(Sort.By(createRequirementOrderKey, Sort.CompareStrings))
}

/** calculateManagedGraphFingerprint hashes the canonical graph and policy inputs. */
export function calculateManagedGraphFingerprint(
  input: ManagedModuleTypes.ManagedModulesInput,
  normalized: readonly ManagedModuleTypes.NormalizedManagedRequirement[],
): string {
  const requirements = collectAllRequirements(normalized, input.runtimePins)
  return Platform.hashText(Json.Print({
    requirements: Object.fromEntries(Sort.Strings(Object.keys(requirements)).map(key => [key, requirements[key]])),
    target: input.target,
    runtimePins: Object.fromEntries(
      Sort.Strings(Object.keys(input.runtimePins)).map(key => [key, input.runtimePins[key]]),
    ),
    singletonPackages: Sort.Strings(Runtime.resolveRuntimeSingletonPackages(input.singletonPackages)),
    policyRegistryVersion: 1,
    runtimePolicy: ManagedNpmPolicy.describeManagedResolutionPolicy(input.runtimePolicy),
  }, { prettyPrint: false }))
}

/** calculateManagedProfileFingerprint identifies one graph install for its Bun, host, and compiler settings. */
export function calculateManagedProfileFingerprint(
  input: ManagedModuleTypes.ManagedModulesInput,
  graphFingerprint: string,
): string {
  return Platform.hashText(Json.Print({
    graphFingerprint,
    bunVersion: input.bunVersion,
    installHost: installHostIdentity(input),
    typeScriptDefaultsHash: typeScriptDefaultsHash(),
    runtimePatches: ManagedNpmPolicy.calculateManagedPatchIdentity(input.runtimePolicy),
  }, { prettyPrint: false }))
}

/** resolveManagedProfilePath resolves the host-specific generated profile directory. */
export function resolveManagedProfilePath(input: ManagedModuleTypes.ManagedModulesInput, fingerprint: string): string {
  return Path.join(input.directory, '.tao', 'cache', 'managed-modules', fingerprint)
}

/** resolveManagedDurableLockPath locates the canonical lock for a graph identity. */
export function resolveManagedDurableLockPath(
  input: ManagedModuleTypes.ManagedModulesInput,
  graphFingerprint: string,
): string {
  return Path.join(input.directory, '.tao', 'store', 'npm', `${graphFingerprint}.lock`)
}

/** resolveManagedDurableLockHashPath locates the integrity record for a graph's durable lock. */
export function resolveManagedDurableLockHashPath(
  input: ManagedModuleTypes.ManagedModulesInput,
  graphFingerprint: string,
): string {
  return Path.join(input.directory, '.tao', 'store', 'npm', `${graphFingerprint}.sha256`)
}

function createRequirementOrderKey(requirement: ManagedModuleTypes.NormalizedManagedRequirement): string {
  const declaration = [requirement.directory, requirement.name, requirement.version].join(NullCharacter)
  return `${declaration}${NewlineCharacter}${requirement.origin}`
}
