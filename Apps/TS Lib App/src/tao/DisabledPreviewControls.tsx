import Tao from '@tao/runtime-api'
import React from 'react'
import { Pressable } from 'react-native'

/** DisabledPreviewControls exercises Tao and React Native controls in the same sidecar. */
export function DisabledPreviewControls({ Locked }: { Locked: boolean }) {
  const disabled = Tao.useInteractionDisabled()
  const state = Tao.useWritable(() => ({ tao: 0, raw: 0, programmatic: 0 }))
  const counts = Tao.useValue(state)
  function recordPress(kind: keyof typeof counts) {
    const previous = state.jsValue()
    state.update({ ...previous, [kind]: previous[kind] + 1 })
  }
  React.useEffect(() => {
    if (Locked) {
      recordPress('programmatic')
    }
  }, [Locked])
  return (
    <Tao.View>
      <Tao.Pressable testID="taoPreviewPress" onPress={() => recordPress('tao')}>
        <Tao.Text>{`Tao presses: ${counts.tao}`}</Tao.Text>
      </Tao.Pressable>
      <Pressable
        testID="rawPreviewPress"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={disabled ? undefined : () => recordPress('raw')}
      >
        <Tao.Text>{`Raw presses: ${counts.raw}`}</Tao.Text>
      </Pressable>
      <Tao.Text>{`Programmatic: ${counts.programmatic}`}</Tao.Text>
    </Tao.View>
  )
}
