import { Objects, UserInput } from '@shared'
import React from './Bridge_react/Bridge_react'
import { createComputed, type Expression, useOptionalValue } from './ReactiveEngine'
import type { ValueSnapshot } from './ValueSnapshots'

/** GeneratedValue is an immediate value or a tracked input carried between authored scopes. */
export type GeneratedValue<T> = T | GeneratedExpression<T>

/** InterpolatedText derives one text value from literal parts and tracked inputs. */
export function InterpolatedText(parts: readonly unknown[]): GeneratedValue<string> {
  return bindExpression(createComputed(() => parts.map(readText).join('')))
}

/** bindExpression carries a tracked value through lexical bindings without reading it. */
export function bindExpression<T>(expression: Expression<T>): GeneratedExpression<T> {
  return { [GeneratedExpressionMarker]: expression }
}

/** useReadValue reads one input snapshot and subscribes only if the value can change. */
export function useReadValue<T>(value: GeneratedValue<T>): T {
  const expression = findExpression(value)
  return useOptionalValue(expression, isGeneratedExpression(value) ? undefined : value) as T
}

/** useReadValues reads multiple inputs as one observed tuple. */
export function useReadValues(values: readonly unknown[]): readonly unknown[] {
  const expression = React.useMemo(() => createInputTuple(values), [values])
  return useOptionalValue(expression, values)
}

/** readText reads the current snapshot of a text value, including from an action. */
export function readText(value: unknown): string {
  const snapshot = readValue(value)
  UserInput.require(typeof snapshot === 'string', 'Expected a text value.')
  return snapshot
}

const GeneratedExpressionMarker: unique symbol = Symbol('TaoGeneratedExpression')
type GeneratedExpression<T> = { readonly [GeneratedExpressionMarker]: Expression<T> }

function findExpression<T>(value: GeneratedValue<T>): Expression<T> | undefined {
  return isGeneratedExpression(value) ? value[GeneratedExpressionMarker] : undefined
}

function isGeneratedExpression<T>(value: GeneratedValue<T>): value is GeneratedExpression<T> {
  return Objects.isObject(value) && GeneratedExpressionMarker in value
}

function readValue(value: unknown): unknown {
  const expression = findExpression(value)
  return expression ? expression.jsValue() : value
}

function createInputTuple(values: readonly unknown[]): Expression<ValueSnapshot<typeof values>> | undefined {
  if (values.some(findExpression)) {
    return createComputed(() => values.map(readValue))
  }
  return undefined
}
