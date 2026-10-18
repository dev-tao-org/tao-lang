import { Errors } from '@shared'
import type { ReactNode } from 'react'

/** Scope is one readonly lexical record whose prototype links to its parent scope. */
export type Scope = Readonly<Record<string, unknown>>

/** Scope creates a root lexical object or a child of the supplied scope. */
export function Scope(parent?: Scope): Scope {
  return Object.create(parent ?? null) as Scope
}

/** LetDefinition defines an immutable name in the current lexical scope. */
export function LetDefinition(scope: Scope, name: string, value: unknown): void {
  if (Object.prototype.hasOwnProperty.call(scope, name)) {
    Errors.ThrowUserInput(`Name "${name}" is already defined`)
  }
  Object.defineProperty(scope, name, { value, enumerable: true })
}

/** Value resolves a name from the nearest lexical scope. */
export function Value(scope: Scope, name: string): unknown {
  if (!(name in scope)) {
    Errors.ThrowUserInput(`Undefined name "${name}"`)
  }
  return scope[name]
}

/** RenderChildren evaluates a block body with a child scope and collected nodes. */
export function RenderChildren(parent: Scope, body: (scope: Scope, children: ReactNode[]) => void): ReactNode[] {
  const children: ReactNode[] = []
  body(Scope(parent), children)
  return children
}
