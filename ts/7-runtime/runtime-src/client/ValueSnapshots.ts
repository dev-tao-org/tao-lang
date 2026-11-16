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
type OptionalListLength = number | undefined
type CollectionCopy = {
  source: object
  result: object
  listLength: OptionalListLength
  fields: string[]
  nextField: number
}
type SnapshotCopy = {
  copies: CollectionCopies
  pending: CollectionCopy[]
}
type MatchedCollectionPairs = Map<object, Set<object>>
type CollectionComparison = {
  left: object
  right: object
  fields: string[]
  nextField: number
}
type SnapshotComparison = {
  pairs: MatchedCollectionPairs
  pending: CollectionComparison[]
}
const ownedSnapshots = new WeakSet<object>()
const valueCapabilities = new WeakSet<object>()

function snapshotValue(value: unknown): unknown {
  if (!isObject(value)) {
    return value
  }
  const prototype = findCollectionPrototype(value)
  if (prototype === undefined) {
    return value
  }
  return copyCollection(value, prototype)
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function findCollectionPrototype(value: object): CollectionPrototype | undefined {
  if (ownedSnapshots.has(value) || valueCapabilities.has(value)) {
    return undefined
  }
  const prototype: CollectionPrototype = Object.getPrototypeOf(value)
  return isOrdinaryCollection(value, prototype) ? prototype : undefined
}

function isOrdinaryCollection(value: object, prototype: CollectionPrototype): boolean {
  return Array.isArray(value)
    ? prototype === Array.prototype
    : prototype === Object.prototype || prototype === null
}

function copyCollection(source: object, prototype: CollectionPrototype): object {
  const traversal: SnapshotCopy = { copies: new Map(), pending: [] }
  const snapshot = reuseOrBeginCopy(source, prototype, traversal)
  const { copies, pending } = traversal
  while (pending.length > 0) {
    const copy = pending[pending.length - 1]!
    const name = copy.fields[copy.nextField]
    if (name === undefined) {
      Object.freeze(copy.result)
      ownedSnapshots.add(copy.result)
      copies.set(copy.source, copy.result)
      pending.pop()
      continue
    }
    copy.nextField += 1
    if (copy.listLength !== undefined) {
      if (name === 'length') {
        continue
      }
      requireListIndex(name, copy.listLength)
    }
    const field = requireDataField(copy.source, name)
    const value = copyFieldValue(field, traversal)
    Object.defineProperty(copy.result, name, { value, enumerable: true })
  }
  return snapshot
}

function copyFieldValue(value: unknown, traversal: SnapshotCopy): unknown {
  if (!isObject(value)) {
    return value
  }
  const prototype = findCollectionPrototype(value)
  return prototype === undefined ? value : reuseOrBeginCopy(value, prototype, traversal)
}

function reuseOrBeginCopy(source: object, prototype: CollectionPrototype, traversal: SnapshotCopy): object {
  requireStringFields(source)
  const { copies, pending } = traversal
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
  const fields = Object.getOwnPropertyNames(source)
  pending.push({ source, result, listLength, fields, nextField: 0 })
  return result
}

function requireStringFields(value: object): void {
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    Errors.ThrowUserInput('Tao collection snapshots require string field names.')
  }
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

function compareSnapshotValues(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (!isOwnedSnapshot(left) || !isOwnedSnapshot(right)) {
    return false
  }
  const comparison: SnapshotComparison = { pairs: new Map(), pending: [] }
  if (!queueCollectionComparison(left, right, comparison)) {
    return false
  }
  while (comparison.pending.length > 0) {
    const frame = comparison.pending[comparison.pending.length - 1]!
    const name = frame.fields[frame.nextField]
    if (name === undefined) {
      rememberMatchedPair(frame, comparison.pairs)
      comparison.pending.pop()
      continue
    }
    frame.nextField += 1
    if (!compareCollectionField(frame, name, comparison)) {
      return false
    }
  }
  return true
}

function isOwnedSnapshot(value: unknown): value is object {
  return isObject(value) && ownedSnapshots.has(value)
}

function rememberMatchedPair(frame: CollectionComparison, pairs: MatchedCollectionPairs): void {
  const rights = pairs.get(frame.left) ?? new Set<object>()
  rights.add(frame.right)
  pairs.set(frame.left, rights)
}

function compareCollectionField(frame: CollectionComparison, name: string, comparison: SnapshotComparison): boolean {
  if (!Object.hasOwn(frame.right, name)) {
    return false
  }
  const left: unknown = Reflect.get(frame.left, name)
  const right: unknown = Reflect.get(frame.right, name)
  if (Object.is(left, right)) {
    return true
  }
  const bothOwned = isOwnedSnapshot(left) && isOwnedSnapshot(right)
  return bothOwned && queueCollectionComparison(left, right, comparison)
}

function queueCollectionComparison(left: object, right: object, comparison: SnapshotComparison): boolean {
  const matchedRights = comparison.pairs.get(left)
  if (matchedRights?.has(right)) {
    return true
  }
  if (!haveMatchingCollectionShape(left, right)) {
    return false
  }
  const fields = Object.keys(left)
  if (fields.length !== Object.keys(right).length) {
    return false
  }
  comparison.pending.push({ left, right, fields, nextField: 0 })
  return true
}

function haveMatchingCollectionShape(left: object, right: object): boolean {
  return Array.isArray(left)
    ? Array.isArray(right) && left.length === right.length
    : !Array.isArray(right)
}
