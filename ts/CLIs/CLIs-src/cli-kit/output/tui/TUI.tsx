import type React from '@runtime/client/Bridge_react/Bridge_react'
import { Switch, Time } from '@shared'
import { Terminal } from '@shared/os'
import { Ink } from '../../bridges/Bridge_ink'
import type { OutputRenderer, OutputSnapshot } from '../Output'
import { createPaneInput } from './PromptInput'
import { OutputView } from './View'

/** createTUI creates the Ink renderer on the diagnostic terminal. */
export function createTUI(): OutputRenderer {
  let latest = emptySnapshot()
  let now = Time.nowMs()
  const input = createPaneInput(redraw)
  let disposed = false
  const instance = Ink.render(<TUI snapshot={latest} now={now} receive={input.receive} paste={input.paste} />, {
    stdout: Terminal.stderr,
    stderr: Terminal.stderr,
    patchConsole: false,
    maxFps: 5,
    exitOnCtrlC: false,
  })
  const ticker = createElapsedTicker(() => hasRunningChannel(latest), () => {
    now = Time.nowMs()
    redraw()
  })
  return {
    update(snapshot) {
      latest = snapshot
      now = Time.nowMs()
      redraw()
      ticker.update()
    },
    readInput: Terminal.isInteractive() ? input.read : undefined,
    async dispose() {
      disposed = true
      input.dispose()
      ticker.dispose()
      await instance.waitUntilRenderFlush()
      instance.unmount()
      await instance.waitUntilExit()
    },
  }

  function redraw(): void {
    if (disposed) {
      return
    }
    const prompt = input.message()
    const snapshot = prompt === undefined ? latest : { ...latest, prompt }
    instance.rerender(<TUI snapshot={snapshot} now={now} receive={input.receive} paste={input.paste} />)
  }
}

type TUIProps = {
  now: number
  snapshot: OutputSnapshot
  receive(text: string, key: Ink.Key): void
  paste(text: string): void
}

function TUI(props: TUIProps): React.JSX.Element {
  const isActive = props.snapshot.prompt !== undefined
  Ink.useInput(props.receive, { isActive })
  Ink.usePaste(props.paste, { isActive })
  const { stdout } = Ink.useStdout()
  const width = Math.max(1, stdout.columns ?? 80)
  const height = Math.max(1, stdout.rows ?? 24)
  return <OutputView snapshot={props.snapshot} now={props.now} width={width} height={height} />
}

function emptySnapshot(): OutputSnapshot {
  return { main: { title: 'Tao', status: 'idle', lines: [] }, channels: [], commands: [] }
}

function createElapsedTicker(isRunning: () => boolean, tick: () => void): { update(): void; dispose(): void } {
  type AnimationCancel = (() => void) | undefined
  let cancel: AnimationCancel
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
