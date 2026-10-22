import Tao from '@tao/runtime-api'

export function SidecarGreeting(props: { Value: string }) {
  return <Tao.Text style={{ color: '#f2f2f2' }}>Sidecar: {props.Value}</Tao.Text>
}
