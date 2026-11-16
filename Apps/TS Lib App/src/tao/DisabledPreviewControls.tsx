import Tao from '@tao/runtime-api'
import React from 'react'

/** DisabledPreviewControls exercises Tao and raw browser controls in the same sidecar. */
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
      <Tao.Pressable onPress={() => recordPress('tao')}>
        <Tao.Text>{`Tao presses: ${counts.tao}`}</Tao.Text>
      </Tao.Pressable>
      <button disabled={disabled} onClick={disabled ? undefined : () => recordPress('raw')}>
        Raw presses: {counts.raw}
      </button>
      <Tao.Text>{`Programmatic: ${counts.programmatic}`}</Tao.Text>
    </Tao.View>
  )
}
