import * as ReactNamespace from 'react'
import type { ForwardRefExoticComponent, Ref, RefAttributes } from 'react'
import * as Native from 'react-native'
import { DefaultAppearance } from './Appearance'

export { ReactNamespace as React }
export { DefaultAppearance }
/** ReactNative preserves native exports with temporary light text defaults. */
export const ReactNative = Object.create(Native, {
  Text: { value: ReactNamespace.forwardRef(Text) },
  TextInput: { value: ReactNamespace.forwardRef(TextInput) },
}) as Omit<typeof Native, 'Text' | 'TextInput'> & {
  Text: ForwardRefExoticComponent<Native.TextProps & RefAttributes<Native.Text>>
  TextInput: ForwardRefExoticComponent<Native.TextInputProps & RefAttributes<Native.TextInput>>
}
export { App } from './App'
export { ModuleApplied } from './Preview'
export { LetDefinition, LetReference, RenderChildren, Scope, Value } from './Scope'
export type { Scope as RuntimeScope } from './Scope'
export { Render, ViewDefinition, ViewReference, ViewRenderArgs } from './View'
export type { AppOptions, RuntimeObserver, RuntimeTiming, View, ViewRenderer } from './View'

function Text({ style, ...props }: Native.TextProps, ref: Ref<Native.Text>) {
  return ReactNamespace.createElement(Native.Text, { ...props, ref, style: [textStyle, style] })
}

function TextInput({ style, ...props }: Native.TextInputProps, ref: Ref<Native.TextInput>) {
  return ReactNamespace.createElement(Native.TextInput, {
    placeholderTextColor: DefaultAppearance.border,
    keyboardAppearance: 'dark',
    ...props,
    ref,
    style: [textStyle, style],
  })
}

const textStyle = { color: DefaultAppearance.foreground }
