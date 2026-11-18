import * as AST from '@ast-gen'
import { Switch, UserInput } from '@shared'

/** ScalarType identifies a primitive or nominal scalar domain. */
export type ScalarType = { name: string; base?: ScalarType }

/** TextType identifies the built-in text domain. */
export const TextType: ScalarType = { name: 'text' }

/** NumberType identifies the built-in finite binary64 domain. */
export const NumberType: ScalarType = { name: 'number' }

/** ScalarTypeScope resolves the types declared in one source file. */
export type ScalarTypeScope = { path: string; resolve(name: AST.Name): ScalarType }

/** createScalarTypeScope resolves named scalar types and their nominal ancestors with cycle detection. */
export function createScalarTypeScope(document: AST.Document, path: string): ScalarTypeScope {
  const declared = new Map<string, AST.TypeDeclaration>()
  const resolved = new Map([['text', TextType], ['number', NumberType]])
  const visiting = new Set<string>()
  for (const declaration of AST.GetDeclarations(document)) {
    if (AST.IsKind(declaration, 'TypeDeclaration')) {
      const name = declaration.name.value
      requireAt(!declared.has(name) && !resolved.has(name), path, declaration.name, `Duplicate type ${name}.`)
      declared.set(name, declaration)
    }
  }
  const resolve = (name: AST.Name): ScalarType => {
    const key = name.value
    const known = resolved.get(key)
    if (known) {
      return known
    }
    const declaration = declared.get(key)
    requireAt(declaration, path, name, `Unknown type ${key}.`)
    requireAt(!visiting.has(key), path, name, `Type cycle includes ${key}.`)
    visiting.add(key)
    const base = resolve(declaration.base)
    visiting.delete(key)
    const type = { name: key, base }
    resolved.set(key, type)
    return type
  }
  for (const declaration of declared.values()) {
    resolve(declaration.name)
  }
  return { path, resolve }
}

/** admitsScalarType accepts identity or a declared nominal ancestor. */
export function admitsScalarType(actual: ScalarType, target: ScalarType): boolean {
  for (let current: OptionalScalarType = actual; current; current = current.base) {
    if (current === target) {
      return true
    }
  }
  return false
}

type OptionalScalarType = ScalarType | undefined
type ResolveScalarName = (name: AST.Name) => OptionalScalarType

/** resolveScalarExpression supplies the static type and validates authored construction and widening. */
export function resolveScalarExpression(
  node: AST.Expression,
  scope: ScalarTypeScope,
  resolveName: ResolveScalarName,
): ScalarType | undefined {
  return Switch.kind(node, {
    Name: resolveName,
    TextLiteral: () => TextType,
    NumberLiteral(literal) {
      requireAt(Number.isFinite(literal.value), scope.path, literal, 'Number must be finite.')
      return NumberType
    },
    GroupedExpression: group => resolveScalarExpression(group.value, scope, resolveName),
    ConversionExpression: conversion => resolveConversion(conversion, scope, resolveName),
    ConstructionExpression: construction => resolveConstruction(construction, scope, resolveName),
  })
}

function resolveConversion(
  node: AST.ConversionExpression,
  scope: ScalarTypeScope,
  resolveName: ResolveScalarName,
): ScalarType {
  const source = resolveScalarExpression(node.value, scope, resolveName)
  const target = scope.resolve(node.type)
  requireAt(source, scope.path, node.value, `Expected a scalar value for conversion to ${node.type.value}.`)
  const operand = AST.IsKind(node.value, 'Name') ? node.value.value : 'Value'
  requireAt(source !== target, scope.path, node, `${operand} is already \`${node.type.value}\`.`)
  requireAt(admitsScalarType(source, target), scope.path, node, `Cannot convert ${source.name} to ${target.name}.`)
  return target
}

function resolveConstruction(
  node: AST.ConstructionExpression,
  scope: ScalarTypeScope,
  resolveName: ResolveScalarName,
): ScalarType {
  const target = scope.resolve(node.type)
  const source = resolveScalarExpression(node.value, scope, resolveName)
  requireAt(target.base, scope.path, node.type, `Expected a named scalar type to construct.`)
  requireAt(
    source && admitsScalarType(target, source),
    scope.path,
    node.value,
    `Cannot construct ${target.name} from ${source?.name ?? 'a nonscalar value'}.`,
  )
  return target
}

function requireAt(
  condition: unknown,
  path: string,
  node: AST.Node,
  message: string,
): asserts condition {
  UserInput.Require(Boolean(condition), `${path} (offset ${node.range.start}): ${message}`)
}
