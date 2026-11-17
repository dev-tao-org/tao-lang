import { Objects, UserInput } from '@shared'
import { bindExpression, type GeneratedValue, readText } from './Expressions'
import { createComputed } from './ReactiveEngine'
import { LetDeclaration, Scope } from './Scope'

/** TextFunction identifies one pure text calculation with its declared input roles. */
export type TextFunction = {
  readonly parameters: readonly string[]
  readonly scope: Scope
  readonly evaluate: FunctionBody
  readonly [FunctionMarker]: true
}

/** FunctionDeclaration records a pure calculation and the lexical values it can read. */
export function FunctionDeclaration(scope: Scope, parameters: readonly string[], evaluate: FunctionBody): TextFunction {
  return { scope, parameters, evaluate, [FunctionMarker]: true }
}

/** FunctionCall tracks the input reads and return value of a pure Tao call. */
export function FunctionCall(candidate: unknown, args: readonly CallArgument[]): GeneratedValue<string> {
  const definition = requireFunction(candidate)
  return bindExpression(createComputed(() => evaluateFunction(definition, bindCallArguments(definition, args))))
}

/** invokeTextFunction synchronously runs an exported calculation with a named argument object. */
export function invokeTextFunction(candidate: unknown, values: TextArguments): string {
  const definition = requireFunction(candidate)
  requireArgumentNames(definition, values)
  return evaluateFunction(definition, values)
}

type FunctionBody = (scope: Scope) => unknown
type TextArguments = Readonly<Record<string, string>>
type OptionalRole = string | undefined
type CallArgument = readonly [role: OptionalRole, value: unknown]
const FunctionMarker: unique symbol = Symbol('TaoTextFunction')

function requireFunction(candidate: unknown): TextFunction {
  UserInput.require(isFunction(candidate), 'Expected a pure Tao function.')
  return candidate
}

function isFunction(candidate: unknown): candidate is TextFunction {
  return Objects.isObject(candidate) && FunctionMarker in candidate
}

function bindCallArguments(definition: TextFunction, args: readonly CallArgument[]): TextArguments {
  const named: Record<string, string> = Object.create(null)
  let unnamed: unknown
  for (const [role, value] of args) {
    const text = readText(value)
    if (role === undefined) {
      unnamed = text
    } else {
      named[role] = text
    }
  }
  // Static checking leaves at most one unbound text role.
  const remaining = definition.parameters.find(name => !Object.hasOwn(named, name))
  if (remaining !== undefined) {
    named[remaining] = readText(unnamed)
  }
  return named
}

function requireArgumentNames(definition: TextFunction, values: TextArguments): void {
  const expected = definition.parameters
  const allPresent = expected.every(name => Object.hasOwn(values, name))
  UserInput.require(
    allPresent && Object.keys(values).length === expected.length,
    'Expected the declared Tao function arguments.',
  )
}

function evaluateFunction(definition: TextFunction, values: TextArguments): string {
  const scope = Scope(definition.scope)
  for (const parameter of definition.parameters) {
    LetDeclaration(scope, parameter, readText(values[parameter]))
  }
  return readText(definition.evaluate(scope))
}
