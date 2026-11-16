import { Errors } from '@shared'
import React from './Bridge_react/Bridge_react'

/** DisabledWhen resolves a rendered disabled condition without coercing external values. */
export function DisabledWhen(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    Errors.ThrowUserInput('A disabled condition must be a boolean.')
  }
  return value
}

/** useInteractionDisabled reads the inherited state for a custom control's user interaction. */
export function useInteractionDisabled(): boolean {
  return React.useContext(DisabledInteractionContext)
}

type DisabledInteractionProps = { disabled: boolean; children: React.ReactNode }

/** DisabledInteraction combines a local condition with the already inherited state. */
export function DisabledInteraction({ disabled, children }: DisabledInteractionProps): React.ReactElement {
  const inherited = useInteractionDisabled()
  return React.createElement(DisabledInteractionContext.Provider, { value: inherited || disabled }, children)
}

const DisabledInteractionContext = React.createContext(false)
