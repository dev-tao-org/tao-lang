import React from 'react'
import { Text } from 'react-native'

type GreetingProps = { Value: string }

/** ForeignGreeting implements a Tao foreign view through an ordinary TypeScript export. */
export function ForeignGreeting({ Value }: GreetingProps): React.ReactNode {
  return React.createElement(Text, null, 'Foreign view: ' + Value)
}
