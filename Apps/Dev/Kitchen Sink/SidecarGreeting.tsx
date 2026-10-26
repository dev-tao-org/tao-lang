import Tao from '@tao/runtime-api'

/** SidecarGreeting renders the greeting with its input value. */
export function SidecarGreeting(props: { Value: string }) {
  return <Tao.Text style={{ color: '#f2f2f2' }}>Sidecar: {props.Value}</Tao.Text>
}
