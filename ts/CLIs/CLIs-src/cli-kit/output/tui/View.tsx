import type React from '@runtime/client/Bridge_react/Bridge_react'
import { Ink } from '../../bridges/Bridge_ink'
import { formatCommands, type OutputSnapshot } from '../Output'
import { Columns } from './Columns'
import { displayStatus, elapsed, wrappedTail } from './Display'

/** OutputView renders progress, worker panes and a persistent final command footer. */
export function OutputView(props: OutputViewProps): React.JSX.Element {
  const { snapshot, now, width, height } = props
  const rootLines = wrappedTail(snapshot.main.lines, width, Math.min(3, height - 3))
  const footerRows = snapshot.commands.length ? 1 : 0
  const channelRows = Math.max(0, height - rootLines.length - 4 - footerRows)
  const status = displayStatus(snapshot.main.status)
  return (
    <Ink.Box flexDirection="column" width={width}>
      <Ink.Text color={status.color} wrap="truncate">
        {`${status.mark} ${snapshot.main.title}  ${elapsed(snapshot.main, now)}`}
      </Ink.Text>
      {rootLines.map((line, index) => <Ink.Text key={index} wrap="truncate">{line || ' '}</Ink.Text>)}
      <Columns channels={snapshot.channels} now={now} rows={channelRows} width={width} />
      {snapshot.commands.length > 0 && <Ink.Text>{formatCommands(snapshot.commands, true)}</Ink.Text>}
    </Ink.Box>
  )
}

type OutputViewProps = {
  snapshot: OutputSnapshot
  now: number
  width: number
  height: number
}
