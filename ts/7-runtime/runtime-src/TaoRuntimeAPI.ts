import { createElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  Pressable as NativePressable,
  Text as NativeText,
  TextInput as NativeTextInput,
  View as NativeView,
} from 'react-native'
import { DefaultAppearance } from './Appearance'
import { batch, useComputed, useValue, useWritable } from './ReactiveEngine'

/** Tao exposes the runtime capabilities available to authored TypeScript. */
const Tao = { Text, View, TextInput, Pressable, useWritable, useComputed, useValue }

export default Tao

/** Style describes the supported presentation values for native Tao implementations. */
export type Style = Readonly<{
  flex?: number
  flexDirection?: 'row' | 'column'
  padding?: number
  borderWidth?: number
  fontSize?: number
  color?: string
}>

/** ViewProps describes a native container without exposing React Native contracts. */
export type ViewProps = {
  children?: ReactNode
  style?: Style
  testID?: string
}

/** TextInputProps describes the text input capabilities available to Tao implementations. */
export type TextInputProps = ViewProps & { defaultValue?: string; placeholder?: string }

/** PressableProps describes an action-bearing native container. */
export type PressableProps = ViewProps & { onPress?: () => void }

function Text({ style, ...props }: ViewProps): ReactElement {
  return createElement(NativeText, { ...props, style: [textStyle, style] })
}

function View(props: ViewProps): ReactElement {
  return createElement(NativeView, props)
}

function TextInput({ style, ...props }: TextInputProps): ReactElement {
  return createElement(NativeTextInput, {
    placeholderTextColor: DefaultAppearance.border,
    keyboardAppearance: 'dark',
    ...props,
    style: [textStyle, style],
  })
}

function Pressable({ onPress, ...props }: PressableProps): ReactElement {
  const perform = onPress ? () => batch(onPress) : undefined
  return createElement(NativePressable, { ...props, onPress: perform })
}

const textStyle = { color: DefaultAppearance.foreground }
