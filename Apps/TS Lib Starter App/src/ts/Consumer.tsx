import library from '@example/tao-library'
import Greeting from '@example/tao-library/Greeting'
import React from 'react'
import { Text, View } from 'react-native'

const instance = library.instantiate()

export default function Consumer() {
  return (
    <View>
      <Text>Tao library consumer</Text>
      <library.Provider instance={instance}>
        <Greeting Name="Ada" />
      </library.Provider>
    </View>
  )
}
