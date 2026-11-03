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
  const footerLimit = snapshot.prompt ? Math.max(0, height - 1) : height
  const footerLines = snapshot.commands.length > 0 ? wrappedTail([commands], width, footerLimit) : []
  const footerRows = footerLines.length
  const rootRows = resolveRootFrameRows(snapshot, Math.max(0, height - footerRows))
  const workerRowCount = Panels.channelRowCount(snapshot.channels.length, width)
  const promptRows = snapshot.prompt ? Math.min(2, Math.max(0, height - footerRows - rootRows)) : 0
  const preferredChannelRows = Math.max(1, workerRowCount * (Panels.PaneFrameRows + PreferredWorkerLogRows))
  const gap = height > preferredChannelRows + footerRows + Panels.PaneFrameRows ? 1 : 0
  const rootBudget = Math.max(0, height - preferredChannelRows - footerRows - gap - Panels.PaneFrameRows)
  const completionBudget = resolveCompletionContentRows(snapshot, height - footerRows - rootRows - gap)
  const rootRowLimit = snapshot.main.status === 'running' || snapshot.main.status === 'idle'
    ? Math.max(promptRows, Math.min(MaximumRootLogRows, rootBudget))
    : Math.max(promptRows, completionBudget)
  const rootSource = snapshot.prompt ? [...snapshot.main.lines, snapshot.prompt] : snapshot.main.lines
  const rootLines = wrappedTail(rootSource, Panels.paneContentWidth(width), rootRowLimit)
  const channelRows = Math.max(0, height - rootLines.length - rootRows - gap - footerRows)
  return (
    <Ink.Box flexDirection="column" width={width}>
      <RootPane
        channel={snapshot.main}
        lines={rootLines}
        now={now}
        rows={rootRows}
        width={width}
        prompt={snapshot.prompt}
      />
      <Ink.Box marginTop={gap}>
        <Panels.Columns channels={snapshot.channels} now={now} rows={channelRows} width={width} />
      </Ink.Box>
      {footerLines.map((line, index) => <Ink.Text key={index} wrap="truncate">{line}</Ink.Text>)}
    </Ink.Box>
  )
}

function resolveCompletionContentRows(snapshot: OutputSnapshot, availableRows: number): number {
  // Finished workers need only a status row; leave the root tail room for the final verdict and recovery details.
  const workerRows = Math.min(Math.max(1, snapshot.channels.length), Math.max(0, availableRows - 1))
  return Math.max(0, availableRows - workerRows)
}

function resolveRootFrameRows(snapshot: OutputSnapshot, availableRows: number): number {
  // A frame with only borders and a title would hide the prompt while still accepting input.
  if (snapshot.prompt && availableRows <= Panels.PaneFrameRows) {
    return Math.min(1, availableRows)
  }
  return Math.min(Panels.PaneFrameRows, availableRows)
}

type RootPaneProps = {
  prompt?: string
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
    return props.prompt
      ? <Ink.Text wrap="truncate">{props.prompt}</Ink.Text>
      : <Panels.ChannelSummary channel={props.channel} now={props.now} width={props.width} />
  }
  return <Panels.ChannelPane channel={props.channel} lines={props.lines} now={props.now} width={props.width} />
}
