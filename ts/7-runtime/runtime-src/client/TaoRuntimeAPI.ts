import { DefaultAppearance } from './Appearance'
import ReactNative from './Bridge_react-native'
import React from './Bridge_react/Bridge_react'
import { batch, useComputed, useValue, useWritable } from './ReactiveEngine'

/** Tao exposes the runtime capabilities available to authored TypeScript. */
const Tao = { Text, View, TextInput, Pressable, useWritable, useComputed, useValue }

export default Tao

/** Style describes the supported presentation values for native Tao implementations. */
export type Style = Readonly<{
  flex?: number
  flexDirection?: FlexDirection
  padding?: number
  borderWidth?: number
  fontSize?: number
  color?: string
}>

/** ViewProps describes a native container without exposing React Native contracts. */
export type ViewProps = {
  children?: React.ReactNode
  style?: Style
  testID?: string
}

/** TextInputProps describes the text input capabilities available to Tao implementations. */
export type TextInputProps = ViewProps & { defaultValue?: string; placeholder?: string }

/** PressableProps describes an action-bearing native container. */
export type PressableProps = ViewProps & { onPress?: () => void; accessibilityRole?: 'button' }

function Text({ style, ...props }: ViewProps): React.ReactElement {
  return React.createElement(ReactNative.Text, { ...props, style: [textStyle, style] })
}

function View(props: ViewProps): React.ReactElement {
  return React.createElement(ReactNative.View, props)
}

function TextInput({ style, ...props }: TextInputProps): React.ReactElement {
  return React.createElement(ReactNative.TextInput, {
    placeholderTextColor: DefaultAppearance.border,
    keyboardAppearance: 'dark',
    ...props,
    style: [textStyle, style],
  })
}

function Pressable({ onPress, ...props }: PressableProps): React.ReactElement {
  const perform = onPress ? () => batch(onPress) : undefined
  return React.createElement(ReactNative.Pressable, { ...props, onPress: perform })
}

const textStyle = { color: DefaultAppearance.foreground }

type FlexDirection = 'row' | 'column'
