import * as Sort from '../Sort'
import * as UserInput from '../UserInput'
import { Print } from './Native'

/** Canonical serializes strict JSON data with recursive ordinal UTF-16 object-key order.
 *  Arrays retain order, finite numbers use native spelling and negative zero becomes zero.
 *  Only plain or null-prototype records and dense plain arrays are accepted. Symbols, accessors,
 *  hidden properties, custom prototypes, toJSON hooks and cycles fail instead of losing information.
 *  Shared acyclic references are allowed; proxies are outside this ordinary-data contract. */
export function Canonical(value: unknown): string {
  return serializeValue(value, new Set())
}

function serializeValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return Print(value)
  }
  if (typeof value === 'number') {
    requireFiniteNumber(value)
    return Print(value)
  }
  UserInput.require(typeof value === 'object', 'Canonical JSON requires JSON data without unsupported values.')
  requireAcyclic(value, ancestors)
  ancestors.add(value)
  const result = Array.isArray(value) ? serializeArray(value, ancestors) : serializeRecord(value, ancestors)
  ancestors.delete(value)
  return result
}

function requireFiniteNumber(value: number): void {
  UserInput.require(!!Number.isFinite(value), 'Canonical JSON requires finite numbers.')
}

function requireAcyclic(value: object, ancestors: Set<object>): void {
  UserInput.require(!ancestors.has(value), 'Canonical JSON cannot serialize cycles.')
}

function serializeArray(value: unknown[], ancestors: Set<object>): string {
  requirePrototype(value, Array.prototype)
  const keys = Reflect.ownKeys(value)
  UserInput.require(keys.length === value.length + 1, 'Canonical JSON requires dense arrays without extra properties.')
  const values: string[] = []
  for (let index = 0; index < value.length; index++) {
    values.push(serializeValue(requireDataProperty(value, String(index)), ancestors))
  }
  return `[${values.join(',')}]`
}

function serializeRecord(value: object, ancestors: Set<object>): string {
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== null) {
    requirePrototype(value, Object.prototype)
  }
  const keys = Reflect.ownKeys(value)
  const names = keys.map(requireStringKey).sort(Sort.CompareStrings)
  const fields = names.map(name => `${Print(name)}:${serializeValue(requireDataProperty(value, name), ancestors)}`)
  return `{${fields.join(',')}}`
}

function requirePrototype(value: object, expected: object): void {
  UserInput.require(
    Object.getPrototypeOf(value) === expected,
    'Canonical JSON requires plain records and arrays without custom prototypes.',
  )
}

type PropertyKey = string | symbol

function requireStringKey(key: PropertyKey): string {
  UserInput.require(typeof key === 'string', 'Canonical JSON cannot serialize symbol keys.')
  return key
}

function requireDataProperty(value: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, name)
  UserInput.require(
    !(!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')),
    'Canonical JSON requires enumerable data properties without holes or accessors.',
  )
  return descriptor.value as unknown
}
