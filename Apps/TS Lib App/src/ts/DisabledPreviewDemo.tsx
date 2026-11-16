import DisabledPreview from '@example/tao-library/DisabledPreview'
import React from 'react'
import { Pressable, Text } from 'react-native'

/** DisabledPreviewDemo supplies an ordinary React boolean prop to the compiled Tao view. */
export default function DisabledPreviewDemo() {
  const [locked, setLocked] = React.useState(false)
  return (
    <>
      <Pressable accessibilityRole="button" testID="previewLock" onPress={() => setLocked(!locked)}>
        <Text style={{ color: 'white' }}>{locked ? 'Unlock preview' : 'Lock preview'}</Text>
      </Pressable>
      <DisabledPreview Locked={locked} />
    </>
  )
}
