import { DefaultAppearance } from './Appearance'
import ReactNative from './Bridge_react-native'
import React from './Bridge_react/Bridge_react'
import { useInteractionDisabled } from './DisabledInteraction'
import { batch, useComputed, useValue, useWritable } from './ReactiveEngine'

/** Tao exposes the runtime capabilities available to authored TypeScript. */
const Tao = { Text, View, TextInput, Pressable, useInteractionDisabled, useWritable, useComputed, useValue }

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
export type PressableProps = ViewProps & { onPress?: () => void }

function Text({ style, ...props }: ViewProps): React.ReactElement {
  return React.createElement(ReactNative.Text, { ...props, style: [textStyle, style] })
}

function View(props: ViewProps): React.ReactElement {
  return React.createElement(ReactNative.View, props)
}

function TextInput({ style, ...props }: TextInputProps): React.ReactElement {
  const disabled = useInteractionDisabled()
  const edited = React.useRef<OptionalInputText>(undefined)
  return React.createElement(ReactNative.TextInput, {
    'placeholderTextColor': DefaultAppearance.border,
    'keyboardAppearance': 'dark',
    ...props,
    // Android reapplies defaultValue when editable changes. Keep the last native edit across that update.
    'defaultValue': edited.current ?? props.defaultValue,
    'onChangeText'(value: string) {
      if (!disabled) {
        edited.current = value
      }
    },
    // Android's accessibility setter retains the old value when the whole state is removed.
    'aria-disabled': disabled,
    'focusable': disabled ? false : undefined,
    'readOnly': disabled || undefined,
    'style': [textStyle, style, disabled && DisabledStyle],
  })
}

type OptionalInputText = string | undefined

function Pressable({ onPress, style, ...props }: PressableProps): React.ReactElement {
  const disabled = useInteractionDisabled()
  const perform = !disabled && onPress ? () => batch(onPress) : undefined
  return React.createElement(ReactNative.Pressable, {
    ...props,
    accessibilityRole: 'button',
    accessibilityState: { disabled },
    disabled,
    focusable: disabled ? false : undefined,
    onPress: perform,
    style: [style, disabled && DisabledStyle],
  })
}

const textStyle = { color: DefaultAppearance.foreground }
const DisabledStyle = { opacity: 0.6 }

type FlexDirection = 'row' | 'column'
