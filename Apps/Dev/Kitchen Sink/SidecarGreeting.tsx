import { Text } from 'react-native'

export function SidecarGreeting(props: { Value: string }) {
  return <Text style={{ color: '#f2f2f2' }}>Sidecar: {props.Value}</Text>
}
