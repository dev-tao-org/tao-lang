import { UserInput } from '@shared'
import type { Scope } from './Scope'

/** ScalarTypeDeclaration records a checked file-local nominal scalar type for compiled expressions. */
export function ScalarTypeDeclaration(scope: Scope, name: string, identity: string): void {
  const existing = (scope as ScalarScope)[scalarTypes]
  const declarations = existing ?? new Map<string, string>()
  if (!existing) {
    Object.defineProperty(scope, scalarTypes, { value: declarations })
  }
  declarations.set(name, identity)
}

/** ConstructScalar creates an immutable nominal value from its compatible scalar representation. */
export function ConstructScalar(scope: Scope, type: string, value: unknown): unknown {
  const identity = (scope as ScalarScope)[scalarTypes]?.get(type)
  UserInput.Require(identity !== undefined, `Expected a nominal type for ${type}.`)
  if (isNominalScalar(value) && value.identity === identity) {
    return value
  }
  return Object.freeze(new NominalScalar(identity, requirePrimitiveScalar(unwrapScalar(value))))
}

/** WidenScalar uses an existing value at a checked type, exposing primitive backing at a primitive target. */
export function WidenScalar(scope: Scope, type: string, value: unknown): unknown {
  return (scope as ScalarScope)[scalarTypes]?.has(type) ? value : unwrapScalar(value)
}

/** unwrapScalar supplies the backing value when a binding expects a primitive. */
export function unwrapScalar(value: unknown): unknown {
  return isNominalScalar(value) ? value.value : value
}

type ScalarValue = PrimitiveScalar | NominalScalar

/** requireScalar admits the primitive and nominal values available to authored scalar state. */
export function requireScalar(value: unknown): ScalarValue {
  return isNominalScalar(value) ? value : requirePrimitiveScalar(value)
}

/** compareNominalScalars compares immutable nominal values by declaration identity and payload. */
export function compareNominalScalars(left: unknown, right: unknown): boolean {
  if (isNominalScalar(left) && isNominalScalar(right)) {
    return left.identity === right.identity && Object.is(left.value, right.value)
  }
  return false
}

type PrimitiveScalar = string | number
type ScalarScope = Scope & { readonly [scalarTypes]?: Map<string, string> }
const scalarTypes: unique symbol = Symbol('TaoScalarTypes')

class NominalScalar {
  constructor(readonly identity: string, readonly value: PrimitiveScalar) {}
}

function isNominalScalar(value: unknown): value is NominalScalar {
  return value instanceof NominalScalar
}

function requirePrimitiveScalar(value: unknown): PrimitiveScalar {
  const isFiniteNumber = typeof value === 'number' && Number.isFinite(value)
  UserInput.Require(typeof value === 'string' || isFiniteNumber, 'Expected a text or finite number value.')
  return value
}
