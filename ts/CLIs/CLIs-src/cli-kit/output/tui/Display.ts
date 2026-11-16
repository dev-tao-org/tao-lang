import { NewlineCharacter, Switch } from '@shared'
import wrapAnsi from '../../bridges/Bridge_wrap-ansi'
import type { ChannelState } from '../Output'

type DisplayStatus = { mark: string; color: DisplayColor }
/** displayStatus maps a channel status to its compact marker and color. */
export function displayStatus(status: ChannelState['status']): DisplayStatus {
  return Switch(status, {
    idle: () => ({ mark: '○', color: 'gray' }),
    running: () => ({ mark: '●', color: 'yellow' }),
    passed: () => ({ mark: '✓', color: 'green' }),
    failed: () => ({ mark: '✗', color: 'red' }),
  })
}

type DisplayColor = 'green' | 'red' | 'yellow' | 'gray'

/** elapsed formats a channel's completed or current run duration. */
export function elapsed(channel: ChannelState, now: number): string {
  if (channel.startedAtMs === undefined) {
    return '—'
  }
  const seconds = Math.max(0, Math.floor(((channel.finishedAtMs ?? now) - channel.startedAtMs) / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** wrappedTail wraps complete terminal graphemes before selecting the visible tail. */
export function wrappedTail(lines: readonly string[], width: number, limit: number): string[] {
  if (limit <= 0) {
    return []
  }
  return lines.flatMap(line =>
    wrapAnsi(line, width, { hard: true, trim: false, wordWrap: false }).split(NewlineCharacter)
  ).slice(
    -limit,
  )
}
