import type React from '@runtime/client/Bridge_react/Bridge_react'
import { Ink } from '../../bridges/Bridge_ink'
import type { ChannelState } from '../Output'
import { displayStatus, elapsed, wrappedTail } from './Display'

/** Columns renders channel output in equal-width terminal panes. */
export function Columns(props: ColumnsProps): React.JSX.Element {
  const count = props.channels.length
  if (count === 0) {
    return <Ink.Text color="gray">No active channels.</Ink.Text>
  }
  const gapWidth = count > 1 ? 1 : 0
  const paneWidth = Math.max(1, Math.floor((props.width - gapWidth * (count - 1)) / count))
  return (
    <Ink.Box flexDirection="row" gap={gapWidth} width={props.width}>
      {props.channels.map(channel => (
        <ChannelPane
          channel={channel}
          key={channel.title}
          now={props.now}
          paneWidth={paneWidth}
          rows={props.rows}
        />
      ))}
    </Ink.Box>
  )
}

type ColumnsProps = {
  channels: readonly ChannelState[]
  now: number
  rows: number
  width: number
}

type ChannelPaneProps = {
  channel: ChannelState
  now: number
  paneWidth: number
  rows: number
}

function ChannelPane(props: ChannelPaneProps): React.JSX.Element {
  const { channel } = props
  const status = displayStatus(channel.status)
  const title = `${status.mark} ${channel.title} ${elapsed(channel, props.now)}`
  const lines = wrappedTail(channel.lines, props.paneWidth, props.rows)
  return (
    <Ink.Box flexDirection="column" width={props.paneWidth}>
      <Ink.Text color={status.color} wrap="truncate">{title}</Ink.Text>
      {lines.map((line, index) => <Ink.Text key={index} wrap="truncate">{line || ' '}</Ink.Text>)}
    </Ink.Box>
  )
}
