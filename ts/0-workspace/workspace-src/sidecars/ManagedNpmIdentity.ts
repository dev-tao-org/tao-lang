import { Path, Platform } from '@shared/os'
import { allRequirements, defaultSingletonPackages } from './ManagedModuleGraph'
import { typeScriptDefaultsHash } from './ManagedModuleMetadata'
import type { ManagedModulesInput, NormalizedManagedRequirement } from './ManagedModuleTypes'
import { installHostIdentity } from './ManagedNpmHost'

/** normalizeManagedRequirements sorts declaration inputs with locale-independent code-point order. */
export function normalizeManagedRequirements(input: ManagedModulesInput): NormalizedManagedRequirement[] {
  return input.modules.flatMap(module =>
    module.requirements.map(requirement => ({ directory: module.directory, ...requirement }))
  ).sort((left, right) => {
    const leftKey = requirementOrderKey(left)
    const rightKey = requirementOrderKey(right)
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
}

/** managedGraphFingerprint hashes the canonical graph and policy inputs. */
export function managedGraphFingerprint(
  input: ManagedModulesInput,
  normalized: readonly NormalizedManagedRequirement[],
): string {
  const requirements = allRequirements(normalized, input.runtimePins)
  return Platform.hashText(JSON.stringify({
    requirements: Object.fromEntries(Object.keys(requirements).sort().map(key => [key, requirements[key]])),
    target: input.target,
    runtimePins: Object.fromEntries(Object.keys(input.runtimePins).sort().map(key => [key, input.runtimePins[key]])),
    singletonPackages: [...input.singletonPackages ?? defaultSingletonPackages].sort(),
    policyRegistryVersion: 1,
  }))
}

/** managedProfileFingerprint identifies one graph install for its Bun, host, and compiler settings. */
export function managedProfileFingerprint(input: ManagedModulesInput, graphFingerprint: string): string {
  return Platform.hashText(JSON.stringify({
    graphFingerprint,
    bunVersion: input.bunVersion,
    installHost: installHostIdentity(input),
    typeScriptDefaultsHash: typeScriptDefaultsHash(),
  }))
}

/** managedProfilePath resolves the host-specific generated profile directory. */
export function managedProfilePath(input: ManagedModulesInput, fingerprint: string): string {
  return Path.join(input.directory, '.tao', 'cache', 'managed-modules', fingerprint)
}

/** managedDurableLockPath resolves the canonical lock location for a graph identity. */
export function managedDurableLockPath(input: ManagedModulesInput, graphFingerprint: string): string {
  return Path.join(input.directory, '.tao', 'store', 'npm', `${graphFingerprint}.lock`)
}

/** managedDurableLockHashPath resolves the integrity record for a graph's durable lock. */
export function managedDurableLockHashPath(input: ManagedModulesInput, graphFingerprint: string): string {
  return Path.join(input.directory, '.tao', 'store', 'npm', `${graphFingerprint}.sha256`)
}

function requirementOrderKey(requirement: NormalizedManagedRequirement): string {
  return `${requirement.directory}\0${requirement.name}\0${requirement.version}\n${requirement.origin}`
}
