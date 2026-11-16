import library from '@tao-dev/ts-lib-example'
import Card from '@tao-dev/ts-lib-example/Catalog/Greeting'
import Greeting from '@tao-dev/ts-lib-example/Greeting'
import LanguageFeatures from '@tao-dev/ts-lib-example/LanguageFeatures'
import Panel from '@tao-dev/ts-lib-example/Panel'
import ValueSnapshots from '@tao-dev/ts-lib-example/ValueSnapshots'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

const first = library.instantiate()
const second = library.instantiate()

export default function Consumer() {
  const [name, setName] = React.useState('Ada')
  const [mounted, setMounted] = React.useState(true)
  return (
    <View style={styles.page}>
      <Text style={styles.title}>TS Lib App</Text>
      <Pressable style={styles.button} testID="update" onPress={() => setName('Grace')}>
        <Text style={styles.label}>Update first greeting</Text>
      </Pressable>
      <Pressable style={styles.button} testID="unmount" onPress={() => setMounted(false)}>
        <Text style={styles.label}>Unmount first instance</Text>
      </Pressable>
      <Text style={styles.label} testID="borrowed-instance">{first.disposed ? 'disposed' : 'borrowed'}</Text>
      {mounted && (
        <View style={styles.instance} testID="instance-A">
          <library.Provider instance={first}>
            <Greeting First={name} Second="Lovelace" />
            <Panel>
              <Text style={styles.label} testID="react-child">React child</Text>
            </Panel>
            <Card Value="Published submodule" />
            <View testID="language-features">
              <LanguageFeatures Name="Ada" />
              <ValueSnapshots />
            </View>
          </library.Provider>
        </View>
      )}
      <View style={styles.instance} testID="instance-B">
        <library.Provider instance={second}>
          <Greeting First="Alan" Second="Turing" />
        </library.Provider>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, gap: 12, backgroundColor: '#252525' },
  title: { fontSize: 24, color: '#e8e6e3' },
  label: { color: '#e8e6e3' },
  button: { padding: 10, borderWidth: 1, borderColor: '#b8b4ae', alignSelf: 'flex-start' },
  instance: { padding: 12, borderWidth: 1, borderColor: '#555' },
})
