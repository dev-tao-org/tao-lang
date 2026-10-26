import { Errors } from '@shared'
import type { ReactNode } from 'react'

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

/** ScopeAliases projects selected lexical names lazily through their original generated definition types. */
export function ScopeAliases<Bindings extends Scope>(
  scope: Scope,
  names: { readonly [Name in keyof Bindings]: string },
): Bindings {
  const aliases = Scope()
  for (const [name, target] of Object.entries(names)) {
    AliasBinding(aliases, name, () => Name(scope, target))
  }
  return aliases as Bindings
}

/** Name resolves a value from the nearest lexical scope. */
export function Name(scope: Scope, name: string): unknown {
  if (!(name in scope)) {
    Errors.ThrowUserInput(`Undefined name "${name}"`)
  }
  return scope[name]
}

/** ViewRenderBlock evaluates a block body with a child scope and collected nodes. */
export function ViewRenderBlock<Parent extends Scope>(
  parent: Parent,
  body: (scope: Parent, children: ReactNode[]) => void,
): ReactNode[] {
  const children: ReactNode[] = []
  body(Scope(parent) as Parent, children)
  return children
}
