import type React from '@runtime/client/Bridge_react/Bridge_react'
import { Ink } from '../../bridges/Bridge_ink'
import { formatCommands, type OutputSnapshot } from '../Output'
import * as Panels from './Columns'
import { wrappedTail } from './Display'

type OutputViewProps = {
  snapshot: OutputSnapshot
  now: number
  width: number
  height: number
}
const MaximumRootLogRows = 3
const PreferredWorkerLogRows = 2

/** OutputView renders progress, worker panes and a persistent final command footer. */
export function OutputView(props: OutputViewProps): React.JSX.Element {
  const { snapshot, now, width, height } = props
  const commands = formatCommands(snapshot.commands, true)
  const footerLines = snapshot.commands.length > 0 ? wrappedTail([commands], width, height) : []
  const footerRows = footerLines.length
  const rootRows = Math.min(Panels.PaneFrameRows, Math.max(0, height - footerRows))
  const workerRowCount = Panels.channelRowCount(snapshot.channels.length, width)
  const preferredChannelRows = Math.max(1, workerRowCount * (Panels.PaneFrameRows + PreferredWorkerLogRows))
  const gap = height > preferredChannelRows + footerRows + Panels.PaneFrameRows ? 1 : 0
  const rootBudget = Math.max(0, height - preferredChannelRows - footerRows - gap - Panels.PaneFrameRows)
  const rootRowLimit = Math.min(MaximumRootLogRows, rootBudget)
  const rootLines = wrappedTail(snapshot.main.lines, Panels.paneContentWidth(width), rootRowLimit)
  const channelRows = Math.max(0, height - rootLines.length - rootRows - gap - footerRows)
  return (
    <Ink.Box flexDirection="column" width={width}>
      <RootPane channel={snapshot.main} lines={rootLines} now={now} rows={rootRows} width={width} />
      <Ink.Box marginTop={gap}>
        <Panels.Columns channels={snapshot.channels} now={now} rows={channelRows} width={width} />
      </Ink.Box>
      {footerLines.map((line, index) => <Ink.Text key={index} wrap="truncate">{line}</Ink.Text>)}
    </Ink.Box>
  )
}

type RootPaneProps = {
  channel: OutputSnapshot['main']
  lines: readonly string[]
  now: number
  rows: number
  width: number
}

function RootPane(props: RootPaneProps): React.JSX.Element | null {
  if (props.rows <= 0) {
    return null
  }
  if (props.rows < Panels.PaneFrameRows) {
    return <Panels.ChannelSummary channel={props.channel} now={props.now} width={props.width} />
  }
  return <Panels.ChannelPane channel={props.channel} lines={props.lines} now={props.now} width={props.width} />
}
