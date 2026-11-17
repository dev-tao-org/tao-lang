import React from 'react'
import { Text, View } from 'react-native'

type CaptionProps = { Value: string }

/** ReactiveCaptionProbe exposes the caption and downstream render count to the consumer journey. */
export function ReactiveCaptionProbe({ Value }: CaptionProps): React.ReactNode {
  const renders = React.useRef(0)
  renders.current += 1
  return (
    <View testID="reactive-caption">
      <Text>{Value}</Text>
      <Text testID="reactive-caption-renders">{renders.current}</Text>
    </View>
  )
}
