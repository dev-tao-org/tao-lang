import { Greeting, LanguageFeatures, Panel, ScoreReadout, ValueSnapshots } from '@tao-dev/ts-lib-example'
import { Caption } from '@tao-dev/ts-lib-example/@cards'
import { DetailedCard } from '@tao-dev/ts-lib-example/@cards/details'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

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
        <Text style={styles.label}>Unmount first greeting</Text>
      </Pressable>
      {mounted && (
        <View style={styles.instance} testID="instance-A">
          <View testID="first-greeting">
            <Greeting First={name} Second="Lovelace" />
          </View>
          <Panel>
            <Text style={styles.label} testID="react-child">React child</Text>
          </Panel>
          <Caption Value="Published package" />
          <DetailedCard Value="Published subfolder" />
          <View testID="language-features">
            <ScoreReadout Value={8} />
            <LanguageFeatures Name={name} />
            <ValueSnapshots />
          </View>
        </View>
      )}
      <View style={styles.instance} testID="instance-B">
        <Greeting First="Alan" Second="Turing" />
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
