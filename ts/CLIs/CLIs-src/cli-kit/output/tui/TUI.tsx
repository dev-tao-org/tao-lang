import { Switch, Time } from '@shared'
import { Terminal } from '@shared/os'
import { Box, render, Text, useStdout } from 'ink'
import type { JSX } from 'react'
import type { OutputRenderer, OutputSnapshot } from '../Output'
import { Columns } from './Columns'
import { displayStatus, elapsed, wrappedTail } from './Display'

/** createTUI creates the Ink renderer on the diagnostic terminal. */
export function createTUI(): OutputRenderer {
  let latest = emptySnapshot()
  let now = Time.nowMs()
  const instance = render(<TUI snapshot={latest} now={now} />, {
    stdout: Terminal.stderr,
    stderr: Terminal.stderr,
    patchConsole: false,
    maxFps: 5,
    exitOnCtrlC: false,
  })
  const ticker = createElapsedTicker(() => hasRunningChannel(latest), () => {
    now = Time.nowMs()
    instance.rerender(<TUI snapshot={latest} now={now} />)
  })
  return {
    update(snapshot) {
      latest = snapshot
      now = Time.nowMs()
      instance.rerender(<TUI snapshot={latest} now={now} />)
      ticker.update()
    },
    async dispose() {
      ticker.dispose()
      await instance.waitUntilRenderFlush()
      instance.unmount()
      await instance.waitUntilExit()
    },
  }
}

function TUI(props: {
  now: number
  snapshot: OutputSnapshot
}): JSX.Element {
  const { stdout } = useStdout()
  const width = Math.max(1, stdout.columns ?? 80)
  const height = Math.max(4, stdout.rows ?? 24)
  const rootLines = wrappedTail(props.snapshot.main.lines, width, Math.min(3, height - 3))
  const channelRows = Math.max(0, height - rootLines.length - 4)
  const status = displayStatus(props.snapshot.main.status)
  return (
    <Box flexDirection="column" width={width}>
      <Text color={status.color} wrap="truncate">
        {`${status.mark} ${props.snapshot.main.title}  ${elapsed(props.snapshot.main, props.now)}`}
      </Text>
      {rootLines.map((line, index) => <Text key={index} wrap="truncate">{line || ' '}</Text>)}
      <Columns
        channels={props.snapshot.channels}
        now={props.now}
        rows={channelRows}
        width={width}
      />
    </Box>
  )
}

function emptySnapshot(): OutputSnapshot {
  return { main: { title: 'Tao', status: 'idle', lines: [] }, channels: [] }
}

function createElapsedTicker(isRunning: () => boolean, tick: () => void): { update(): void; dispose(): void } {
  let cancel: (() => void) | undefined
  let disposed = false
  const canSchedule = () => !cancel && !disposed && isRunning()
  const schedule = () => {
    if (!canSchedule()) {
      return
    }
    cancel = Time.schedule(200, () => {
      cancel = undefined
      if (disposed || !isRunning()) {
        return
      }
      tick()
      schedule()
    })
  }
  return {
    update() {
      if (isRunning()) {
        schedule()
      } else {
        cancel?.()
        cancel = undefined
      }
    },
    dispose() {
      disposed = true
      cancel?.()
      cancel = undefined
    },
  }
}

function hasRunningChannel(snapshot: OutputSnapshot): boolean {
  return Switch(snapshot.main.status, {
    idle: () => snapshot.channels.some(channel => channel.status === 'running'),
    running: () => true,
    passed: () => snapshot.channels.some(channel => channel.status === 'running'),
    failed: () => snapshot.channels.some(channel => channel.status === 'running'),
  })
}
