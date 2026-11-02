import type React from '@runtime/client/Bridge_react/Bridge_react'
import { Ink } from '../../bridges/Bridge_ink'
import type { ChannelState } from '../Output'
import { displayStatus, elapsed, wrappedTail } from './Display'

/** PaneFrameRows reserves a title and the two horizontal borders. */
export const PaneFrameRows = 3

type ColumnsProps = {
  channels: readonly ChannelState[]
  now: number
  rows: number
  width: number
}
/** Columns wraps bordered worker panes into rows with room for readable output. */
export function Columns(props: ColumnsProps): React.JSX.Element | null {
  if (props.rows <= 0) {
    return null
  }
  const count = props.channels.length
  if (count === 0) {
    return <Ink.Text color="gray">No active channels.</Ink.Text>
  }
  const rowCount = channelRowCount(count, props.width)
  if (rowCount * PaneFrameRows > props.rows) {
    return <CompactColumns {...props} />
  }
  const columns = Math.ceil(count / rowCount)
  const paneWidth = Math.max(1, Math.floor((props.width - columns + 1) / columns))
  const rowGap = props.rows >= rowCount * (PaneFrameRows + 1) + rowCount - 1 ? 1 : 0
  const logRows = Math.max(0, Math.floor((props.rows - rowGap * (rowCount - 1)) / rowCount) - PaneFrameRows)
  const rows = Array.from(
    { length: rowCount },
    (_, index) => props.channels.slice(index * columns, (index + 1) * columns),
  )
  return (
    <Ink.Box flexDirection="column" gap={rowGap} width={props.width}>
      {rows.map((channels, index) => (
        <Ink.Box flexDirection="row" gap={1} key={index}>
          {channels.map(channel => {
            const lines = wrappedTail(channel.lines, paneContentWidth(paneWidth), logRows)
            return <ChannelPane channel={channel} key={channel.title} lines={lines} now={props.now} width={paneWidth} />
          })}
        </Ink.Box>
      ))}
    </Ink.Box>
  )
}

type ChannelSummaryProps = {
  channel: ChannelState
  now: number
  width: number
}

/** ChannelSummary keeps one channel's status and title within a single terminal row. */
export function ChannelSummary(props: ChannelSummaryProps): React.JSX.Element {
  const status = displayStatus(props.channel.status)
  const title = `${status.mark} ${props.channel.title} ${elapsed(props.channel, props.now)}`
  return (
    <Ink.Box width={props.width}>
      <Ink.Text color={status.color} wrap="truncate">{title}</Ink.Text>
    </Ink.Box>
  )
}

type ChannelPaneProps = {
  channel: ChannelState
  lines: readonly string[]
  now: number
  width: number
}

/** ChannelPane separates one task's title and prepared output with a rounded border. */
export function ChannelPane(props: ChannelPaneProps): React.JSX.Element {
  const { channel } = props
  const status = displayStatus(channel.status)
  const title = `${status.mark} ${channel.title} ${elapsed(channel, props.now)}`
  return (
    <Ink.Box
      borderStyle="round"
      borderColor="gray"
      flexDirection="column"
      flexShrink={0}
      paddingX={1}
      width={props.width}
    >
      <Ink.Text color={status.color} wrap="truncate">{title}</Ink.Text>
      {props.lines.map((line, index) => <Ink.Text key={index} wrap="truncate">{line || ' '}</Ink.Text>)}
    </Ink.Box>
  )
}

const MinimumPaneWidth = 36
const MaximumColumns = 3

/** channelRowCount keeps worker titles readable rather than squeezing every task onto one row. */
export function channelRowCount(count: number, width: number): number {
  const columns = Math.min(MaximumColumns, Math.max(1, Math.floor((width + 1) / (MinimumPaneWidth + 1))))
  return Math.ceil(count / columns)
}

const PaneHorizontalInsets = 4

/** paneContentWidth reserves the border and horizontal padding before wrapping output. */
export function paneContentWidth(width: number): number {
  return Math.max(1, width - PaneHorizontalInsets)
}

function CompactColumns(props: ColumnsProps): React.JSX.Element {
  const visibleCount = props.channels.length > props.rows ? Math.max(0, props.rows - 1) : props.channels.length
  const hiddenCount = props.channels.length - visibleCount
  return (
    <Ink.Box flexDirection="column" width={props.width}>
      {props.channels.slice(0, visibleCount).map(channel => (
        <ChannelSummary channel={channel} key={channel.title} now={props.now} width={props.width} />
      ))}
      {hiddenCount > 0 && <Ink.Text color="gray" wrap="truncate">… {hiddenCount} more channels</Ink.Text>}
    </Ink.Box>
  )
}
