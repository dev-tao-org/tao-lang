import { Errors } from '@shared'

/** ValueCapability identifies an expression or observation registered by the reactive runtime. */
export type ValueCapability = ValueCapabilityIdentity

/** ValueSnapshot makes ordinary collection fields read-only through every nesting level. */
export type ValueSnapshot<T> = T extends ValueAtom ? T
  : T extends object ? { readonly [Field in keyof T]: ValueSnapshot<T[Field]> }
  : T

type RegisteredCapability<T> = T & ValueCapability
/** registerValueCapability preserves an authentic handle's identity across snapshot boundaries. */
export function registerValueCapability<T extends object>(capability: T): RegisteredCapability<T> {
  valueCapabilities.add(capability)
  return capability as RegisteredCapability<T>
}

/** takeValueSnapshot copies ordinary collections at ingress and shares existing runtime-owned snapshots. */
export function takeValueSnapshot<T>(value: T): ValueSnapshot<T> {
  return snapshotValue(value) as ValueSnapshot<T>
}

/** areValueSnapshotsEqual compares owned collections by content and uses Object.is for other values. */
export function areValueSnapshotsEqual(left: unknown, right: unknown): boolean {
  return compareSnapshotValues(left, right)
}

declare class ValueCapabilityIdentity {
  private readonly identity: never
}

type ValueAtom =
  | ValueCapability
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | ((...args: never[]) => unknown)
  | (abstract new(...args: never[]) => unknown)
type CollectionPrototype = object | null
type PendingCollectionCopy = object | undefined
type CollectionCopies = Map<object, PendingCollectionCopy>
type MatchedCollectionPairs = Map<object, Set<object>>
const ownedSnapshots = new WeakSet<object>()
const valueCapabilities = new WeakSet<object>()

function snapshotValue(value: unknown, copies?: CollectionCopies): unknown {
  if (!isObject(value) || isRuntimeOwned(value)) {
    return value
  }
  const prototype: CollectionPrototype = Object.getPrototypeOf(value)
  if (!isOrdinaryCollection(value, prototype)) {
    return value
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    return Errors.ThrowUserInput('Tao collection snapshots require string field names.')
  }
  return copyCollection(value, prototype, copies ?? new Map())
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function isRuntimeOwned(value: object): boolean {
  return ownedSnapshots.has(value) || valueCapabilities.has(value)
}

function isOrdinaryCollection(value: object, prototype: CollectionPrototype): boolean {
  return Array.isArray(value)
    ? prototype === Array.prototype
    : prototype === Object.prototype || prototype === null
}

function copyCollection(source: object, prototype: CollectionPrototype, copies: CollectionCopies): object {
  const existing = copies.get(source)
  if (existing !== undefined) {
    return existing
  }
  if (copies.has(source)) {
    return Errors.ThrowUserInput('Tao value snapshots require acyclic lists and records.')
  }
  copies.set(source, undefined)
  const listLength = Array.isArray(source) ? source.length : undefined
  const result: object = listLength === undefined ? Object.create(prototype) : new Array<unknown>(listLength)
  for (const name of Object.getOwnPropertyNames(source)) {
    if (listLength !== undefined) {
      if (name === 'length') {
        continue
      }
      requireListIndex(name, listLength)
    }
    const value = snapshotValue(requireDataField(source, name), copies)
    Object.defineProperty(result, name, { value, enumerable: true })
  }
  Object.freeze(result)
  ownedSnapshots.add(result)
  copies.set(source, result)
  return result
}

function requireListIndex(name: string, length: number): void {
  const index = Number(name)
  const isIntegerKey = Number.isInteger(index) && String(index) === name
  const isInBounds = index >= 0 && index < length
  if (!isIntegerKey || !isInBounds) {
    Errors.ThrowUserInput('Tao list snapshots require indexed data fields.')
  }
}

function requireDataField(source: object, name: string): unknown {
  const field = Object.getOwnPropertyDescriptor(source, name)
  if (!field?.enumerable || !Object.hasOwn(field, 'value')) {
    return Errors.ThrowUserInput('Tao value snapshots require enumerable data fields.')
  }
  return field.value as unknown
}

function compareSnapshotValues(left: unknown, right: unknown, pairs?: MatchedCollectionPairs): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (!isObject(left) || !isObject(right)) {
    return false
  }
  if (!ownedSnapshots.has(left) || !ownedSnapshots.has(right)) {
    return false
  }
  return compareCollectionPair(left, right, pairs ?? new Map())
}

function compareCollectionPair(left: object, right: object, pairs: MatchedCollectionPairs): boolean {
  const matchedRights = pairs.get(left)
  if (matchedRights?.has(right)) {
    return true
  }
  const matchingShape = Array.isArray(left)
    ? Array.isArray(right) && left.length === right.length
    : !Array.isArray(right)
  if (!matchingShape || !areFieldsEqual(left, right, pairs)) {
    return false
  }
  const rights = matchedRights ?? new Set<object>()
  rights.add(right)
  pairs.set(left, rights)
  return true
}

function areFieldsEqual(left: object, right: object, pairs: MatchedCollectionPairs): boolean {
  const fields = Object.keys(left)
  if (fields.length !== Object.keys(right).length) {
    return false
  }
  return fields.every(name =>
    Object.hasOwn(right, name) && compareSnapshotValues(Reflect.get(left, name), Reflect.get(right, name), pairs)
  )
}
