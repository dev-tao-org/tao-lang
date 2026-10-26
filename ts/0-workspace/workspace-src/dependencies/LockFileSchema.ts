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
  return entries.every(([identity, source]) => isLockedSource(source) && source.identity === identity)
    && Object.entries(value.commitPins).every(([key, commit]) => isOwnedCommitPin(key, commit, entries))
    && Object.values(value.roots).every(pin => {
      const separator = pin.lastIndexOf('@')
      return separator > 0 && entries.some(([identity]) => identity === pin.slice(0, separator))
    })
    && (!('npmGraphs' in value) || isGraphRecord(value.npmGraphs))
}

/** isVersionOne reports whether a lock carries the unsupported pre-provenance format. */
export function isVersionOne(value: unknown): boolean {
  return isObjectRecord(value) && value.version === 1
}

/** isOwnedSourceKey validates a project-relative Tao source identifier. */
export function isOwnedSourceKey(key: string): boolean {
  return key.endsWith('.tao') && !key.includes('\\') && !key.startsWith('/') && !key.split('/').includes('..')
}

function isCommitPinRecord(value: unknown): value is Types.DependencyCommitPins {
  return isObjectRecord(value) && Object.entries(value).every(([key, commit]) => {
    const separator = key.lastIndexOf('@')
    return separator > 0 && separator < key.length - 1 && isCommit(commit)
  })
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGraphRecord(value: unknown): boolean {
  return isObjectRecord(value)
    && Object.entries(value).every(([key, reference]) => isOwnedSourceKey(key) && isManagedGraphReference(reference))
}

function isManagedGraphReference(value: unknown): value is Types.ManagedGraphReference {
  return isObjectRecord(value) && 'fingerprint' in value && isSha256(value.fingerprint)
    && 'lockHash' in value && isSha256(value.lockHash)
    && 'lockPath' in value && isSafeRelativePath(value.lockPath)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

function isSafeRelativePath(value: unknown): boolean {
  return typeof value === 'string' && !Path.isAbsolute(value) && !value.includes('\\')
    && !value.split('/').includes('..')
}

function isLockedSource(value: unknown): value is Types.LockedSource {
  return isObjectRecord(value) && 'identity' in value && typeof value.identity === 'string'
    && 'provider' in value && ['github', 'file', 'bundled'].includes(String(value.provider))
    && 'identifier' in value && typeof value.identifier === 'string'
    && 'version' in value && typeof value.version === 'string'
    && (value.provider === 'bundled' || 'location' in value && typeof value.location === 'string')
    && 'requirements' in value && Array.isArray(value.requirements) && value.requirements.every(isRequirement)
    && (value.provider === 'github' ? isCommit(value.commit) : !('commit' in value))
    && (!('subdirectory' in value) || typeof value.subdirectory === 'string')
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(value)
}

function isRequirement(value: unknown): value is Types.DependencyRequirement {
  return isObjectRecord(value) && 'provider' in value && ['github', 'file', 'bundled'].includes(String(value.provider))
    && 'identifier' in value && typeof value.identifier === 'string'
    && 'version' in value && typeof value.version === 'string'
    && (!('alias' in value) || typeof value.alias === 'string')
    && (!('subdirectory' in value) || typeof value.subdirectory === 'string')
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
  return !!identity && isLockedSource(source) && source.provider === 'github' && isCommit(commit)
}
