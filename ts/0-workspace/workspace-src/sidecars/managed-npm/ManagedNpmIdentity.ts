import { NullCharacter } from '@shared'
import { Path, Platform } from '@shared/os'
import { collectAllRequirements, defaultSingletonPackages } from '../managed-modules/ManagedModuleGraph'
import { typeScriptDefaultsHash } from '../managed-modules/ManagedModuleMetadata'
import * as ManagedModuleTypes from '../managed-modules/ManagedModuleTypes'
import { installHostIdentity } from './ManagedNpmHost'
import * as ManagedNpmPolicy from './ManagedNpmPolicy'

/** normalizeManagedRequirements sorts declaration inputs with locale-independent code-point order. */
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
  ).sort((left, right) => {
    const leftKey = createRequirementOrderKey(left)
    const rightKey = createRequirementOrderKey(right)
    return ManagedNpmPolicy.compareCodePointStrings(leftKey, rightKey)
  })
}

/** calculateManagedGraphFingerprint hashes the canonical graph and policy inputs. */
export function calculateManagedGraphFingerprint(
  input: ManagedModuleTypes.ManagedModulesInput,
  normalized: readonly ManagedModuleTypes.NormalizedManagedRequirement[],
): string {
  const requirements = collectAllRequirements(normalized, input.runtimePins)
  return Platform.hashText(JSON.stringify({
    requirements: Object.fromEntries(Object.keys(requirements).sort().map(key => [key, requirements[key]])),
    target: input.target,
    runtimePins: Object.fromEntries(Object.keys(input.runtimePins).sort().map(key => [key, input.runtimePins[key]])),
    singletonPackages: [...input.singletonPackages ?? defaultSingletonPackages].sort(),
    policyRegistryVersion: 1,
    runtimePolicy: ManagedNpmPolicy.describeManagedResolutionPolicy(input.runtimePolicy),
  }))
}

/** calculateManagedProfileFingerprint identifies one graph install for its Bun, host, and compiler settings. */
export function calculateManagedProfileFingerprint(
  input: ManagedModuleTypes.ManagedModulesInput,
  graphFingerprint: string,
): string {
  return Platform.hashText(JSON.stringify({
    graphFingerprint,
    bunVersion: input.bunVersion,
    installHost: installHostIdentity(input),
    typeScriptDefaultsHash: typeScriptDefaultsHash(),
    runtimePatches: ManagedNpmPolicy.calculateManagedPatchIdentity(input.runtimePolicy),
  }))
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
  return `${declaration}\n${requirement.origin}`
}
