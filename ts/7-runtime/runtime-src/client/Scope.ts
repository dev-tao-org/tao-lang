import { Errors } from '@shared'
import type React from './Bridge_react/Bridge_react'

/** Scope is one readonly lexical record whose prototype links to its parent scope. */
export type Scope = Readonly<Record<string, unknown>>

/** Scope creates a root lexical record or a child of the supplied scope. */
export function Scope(parent?: Scope): Scope {
  return Object.create(parent ?? null) as Scope
}

/** LetDeclaration defines an immutable name in the current lexical scope. */
export function LetDeclaration(scope: Scope, name: string, value: unknown): void {
  if (Object.prototype.hasOwnProperty.call(scope, name)) {
    Errors.ThrowUserInput(`Name "${name}" is already defined`)
  }
  Object.defineProperty(scope, name, { value, enumerable: true })
}

/** AliasBinding defines an immutable lazy binding to a value in another scope. */
export function AliasBinding(scope: Scope, name: string, resolve: () => unknown): void {
  if (Object.prototype.hasOwnProperty.call(scope, name)) {
    Errors.ThrowUserInput(`Name "${name}" is already defined`)
  }
  Object.defineProperty(scope, name, { get: resolve, enumerable: true })
}

type ScopeAliasNames<Bindings extends Scope> = { readonly [Name in keyof Bindings]: string }
/** ScopeAliases projects selected lexical names lazily through their original generated definition types. */
export function ScopeAliases<Bindings extends Scope>(
  scope: Scope,
  names: ScopeAliasNames<Bindings>,
): Bindings {
  const aliasesScope = Scope()
  for (const [name, target] of Object.entries(names)) {
    AliasBinding(aliasesScope, name, () => Name(scope, target))
  }
  return aliasesScope as Bindings
}

/** Name resolves a value from the nearest lexical scope. */
export function Name(scope: Scope, name: string): unknown {
  if (!hasScopeBinding(scope, name)) {
    Errors.ThrowUserInput(`Undefined name "${name}"`)
  }
  return scope[name]
}

/** ViewRenderBlock evaluates a block body with a child scope and collected nodes. */
export function ViewRenderBlock<Parent extends Scope>(
  parent: Parent,
  body: (scope: Parent, children: React.ReactNode[]) => void,
): React.ReactNode[] {
  const children: React.ReactNode[] = []
  body(Scope(parent) as Parent, children)
  return children
}

function hasScopeBinding(scope: Scope, name: string): boolean {
  return name in scope
}
