import type React from '@runtime/client/Bridge_react/Bridge_react'
import { Switch, Time } from '@shared'
import { Terminal } from '@shared/os'
import { Ink } from '../../bridges/Bridge_ink'
import type { OutputRenderer, OutputSnapshot } from '../Output'
import { OutputView } from './View'

/** createTUI creates the Ink renderer on the diagnostic terminal. */
export function createTUI(): OutputRenderer {
  let latest = emptySnapshot()
  let now = Time.nowMs()
  const instance = Ink.render(<TUI snapshot={latest} now={now} />, {
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
}): React.JSX.Element {
  const { stdout } = Ink.useStdout()
  const width = Math.max(1, stdout.columns ?? 80)
  const height = Math.max(4, stdout.rows ?? 24)
  return <OutputView snapshot={props.snapshot} now={props.now} width={width} height={height} />
}

function emptySnapshot(): OutputSnapshot {
  return { main: { title: 'Tao', status: 'idle', lines: [] }, channels: [], commands: [] }
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
