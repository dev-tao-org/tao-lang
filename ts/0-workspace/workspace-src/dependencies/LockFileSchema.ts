import { Regxs } from '@shared'
import { Path } from '@shared/os'
import type * as Types from './Types'

/** isDependencyLock validates the complete current durable dependency lock format. */
export function isDependencyLock(value: unknown): value is Types.DependencyLock {
  if (!isObjectRecord(value) || value.version !== 2) {
    return false
  }
  if (!isStringRecord(value.roots) || !isObjectRecord(value.sources) || !isCommitPinRecord(value.commitPins)) {
    return false
  }
  const entries = Object.entries(value.sources)
  const sources = value.sources
  const pins = value.commitPins
  if (!entries.every(([identity, source]) => isConsistentlyPinnedSource(identity, source, pins))) {
    return false
  }
  if (!Object.entries(value.commitPins).every(([key, commit]) => isOwnedCommitPin(key, commit, entries))) {
    return false
  }
  return Object.values(value.roots).every(pin => hasRootCommitPin(pin, sources, pins))
    && (!('npmGraphs' in value) || isGraphRecord(value.npmGraphs))
}

/** isVersionOne reports whether a lock carries the unsupported pre-provenance format. */
export function isVersionOne(value: unknown): boolean {
  return isObjectRecord(value) && value.version === 1
}

/** isOwnedSourceKey validates a project-relative Tao source identifier. */
export function isOwnedSourceKey(key: string): boolean {
  const hasSourceExtension = key.endsWith('.tao') && !key.includes('\\')
  return hasSourceExtension && !key.startsWith('/') && !key.split('/').includes('..')
}

function isCommitPinRecord(value: unknown): value is Types.DependencyCommitPins {
  return isObjectRecord(value) && Object.entries(value).every(([key, commit]) => {
    const separator = key.lastIndexOf('@')
    return separator > 0 && separator < key.length - 1 && isCommit(commit)
  })
}

function isConsistentlyPinnedSource(identity: string, source: unknown, pins: Types.DependencyCommitPins): boolean {
  if (!isLockedSource(source) || source.identity !== identity) {
    return false
  }
  return source.provider !== 'github' || pins[`${source.identity}@${source.version}`] === source.commit
}

function hasRootCommitPin(
  pin: string,
  sources: Record<string, unknown>,
  pins: Types.DependencyCommitPins,
): boolean {
  const separator = pin.lastIndexOf('@')
  if (separator <= 0 || separator === pin.length - 1) {
    return false
  }
  const source = sources[pin.slice(0, separator)]
  return isLockedSource(source) && (source.provider !== 'github' || isCommit(pins[pin]))
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGraphRecord(value: unknown): boolean {
  return isObjectRecord(value)
    && Object.entries(value).every(([key, reference]) => isOwnedSourceKey(key) && isManagedGraphReference(reference))
}

function isManagedGraphReference(value: unknown): value is Types.ManagedGraphReference {
  if (!isObjectRecord(value) || !('fingerprint' in value) || !isSha256(value.fingerprint)) {
    return false
  }
  if (!('lockHash' in value) || !isSha256(value.lockHash)) {
    return false
  }
  return 'lockPath' in value && isSafeRelativePath(value.lockPath)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && Regxs.Sha256HashRegx.test(value)
}

function isSafeRelativePath(value: unknown): boolean {
  if (typeof value !== 'string' || Path.isAbsolute(value)) {
    return false
  }
  return !value.includes('\\') && !value.split('/').includes('..')
}

function isLockedSource(value: unknown): value is Types.LockedSource {
  if (!isObjectRecord(value) || !hasStringProperty(value, 'identity') || !hasSourceFields(value)) {
    return false
  }
  if (value.provider !== 'bundled' && !hasStringProperty(value, 'location')) {
    return false
  }
  if (!hasSourceRequirements(value)) {
    return false
  }
  const hasValidCommit = value.provider === 'github' ? isCommit(value.commit) : !('commit' in value)
  return hasValidCommit && (!('subdirectory' in value) || typeof value.subdirectory === 'string')
}

function hasSourceFields(value: Record<string, unknown>): boolean {
  if (!('provider' in value) || !['github', 'file', 'bundled'].includes(String(value.provider))) {
    return false
  }
  return hasStringProperty(value, 'identifier') && hasStringProperty(value, 'version')
}

function hasStringProperty(value: Record<string, unknown>, key: string): boolean {
  return key in value && typeof value[key] === 'string'
}

function hasSourceRequirements(value: Record<string, unknown>): boolean {
  return 'requirements' in value && Array.isArray(value.requirements) && value.requirements.every(isRequirement)
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && Regxs.GitCommitHashRegx.test(value)
}

function isRequirement(value: unknown): value is Types.DependencyRequirement {
  if (!isObjectRecord(value) || !hasSourceFields(value)) {
    return false
  }
  if ('alias' in value && typeof value.alias !== 'string') {
    return false
  }
  return !('subdirectory' in value) || typeof value.subdirectory === 'string'
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isObjectRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

function isOwnedCommitPin(
  key: string,
  commit: unknown,
  sources: [string, unknown][],
): boolean {
  const separator = key.lastIndexOf('@')
  const identity = separator > 0 ? key.slice(0, separator) : undefined
  const source = sources.find(([candidate]) => candidate === identity)?.[1]
  if (!identity || !isLockedSource(source)) {
    return false
  }
  return source.provider === 'github' && isCommit(commit)
}
