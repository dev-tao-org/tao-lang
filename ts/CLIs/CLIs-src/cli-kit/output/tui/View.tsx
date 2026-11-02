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
  const footerRows = commands ? wrappedTail([commands], width, height).length : 0
  const workerRowCount = Panels.channelRowCount(snapshot.channels.length, width)
  const preferredChannelRows = Math.max(1, workerRowCount * (Panels.PaneFrameRows + PreferredWorkerLogRows))
  const gap = height > preferredChannelRows + footerRows + Panels.PaneFrameRows ? 1 : 0
  const rootBudget = Math.max(0, height - preferredChannelRows - footerRows - gap - Panels.PaneFrameRows)
  const rootRowLimit = Math.min(MaximumRootLogRows, rootBudget)
  const rootLines = wrappedTail(snapshot.main.lines, Panels.paneContentWidth(width), rootRowLimit)
  const channelRows = Math.max(0, height - rootLines.length - Panels.PaneFrameRows - gap - footerRows)
  return (
    <Ink.Box flexDirection="column" width={width}>
      <Panels.ChannelPane channel={snapshot.main} lines={rootLines} now={now} width={width} />
      <Ink.Box marginTop={gap}>
        <Panels.Columns channels={snapshot.channels} now={now} rows={channelRows} width={width} />
      </Ink.Box>
      {snapshot.commands.length > 0 && <Ink.Text>{commands}</Ink.Text>}
    </Ink.Box>
  )
}
