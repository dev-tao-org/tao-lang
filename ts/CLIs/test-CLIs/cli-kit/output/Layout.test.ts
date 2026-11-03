import React from '@runtime/client/Bridge_react/Bridge_react'
import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'
import { Text } from '@shared/os'
import { Ink } from '../../../CLIs-src/cli-kit/bridges/Bridge_ink'
import type { ChannelState, OutputSnapshot } from '../../../CLIs-src/cli-kit/output/Output'
import { OutputView } from '../../../CLIs-src/cli-kit/output/tui/View'

Tests.test('terminal sections have borders and dense worker sets occupy readable rows', () => {
  const snapshot = workerSnapshot()
  const rendered = renderView(snapshot, 160, 32)
  const lines = rendered.split(NewlineCharacter)
  Tests.expect(lines.filter(line => line.includes('╭'))).toHaveLength(4)
  for (const channel of snapshot.channels) {
    Tests.expect(rendered).toContain(channel.title)
  }
  Tests.expect(lines.every(line => line.length <= 160)).toBe(true)
  Tests.expect(lines.length).toBeLessThanOrEqual(32)
  Tests.expect(rendered.trimEnd()).toEndWith('Commands: quit')
})

Tests.test('narrow terminals stack bordered workers while keeping content within the terminal width', () => {
  const snapshot = workerSnapshot()
  const lines = renderView(snapshot, 36, 48).split(NewlineCharacter)
  Tests.expect(lines.filter(line => line.includes('╭'))).toHaveLength(8)
  Tests.expect(lines.every(line => line.length <= 36)).toBe(true)
  Tests.expect(lines.length).toBeLessThanOrEqual(48)
  Tests.expect(lines.at(-1)).toBe('Commands: quit')
})

Tests.test('short terminals drop output tails before worker headers and command shortcuts', () => {
  const snapshot = workerSnapshot()
  const rendered = renderView(snapshot, 160, 14)
  Tests.expect(rendered.split(NewlineCharacter).length).toBeLessThanOrEqual(14)
  for (const channel of snapshot.channels) {
    Tests.expect(rendered).toContain(channel.title)
  }
  Tests.expect(rendered).not.toContain('Preparing test workers')
  Tests.expect(rendered.trimEnd()).toEndWith('Commands: quit')
})

Tests.test('an ordinary terminal keeps worker output visible instead of spending its space on gaps', () => {
  const snapshot = workerSnapshot()
  snapshot.channels = snapshot.channels.map(channel => ({ ...channel, lines: ['Checking compiled contracts'] }))
  const rendered = renderView(snapshot, 80, 24)
  const lines = rendered.split(NewlineCharacter)
  Tests.expect(lines.length).toBeLessThanOrEqual(24)
  Tests.expect(lines.every(line => line.length <= 80)).toBe(true)
  Tests.expect(rendered.split('Checking compiled contracts')).toHaveLength(8)
  Tests.expect(rendered.trimEnd()).toEndWith('Commands: quit')
})

Tests.test('short ordinary terminals retain every compact worker status and the command footer', () => {
  const snapshot = workerSnapshot()
  snapshot.channels[0].status = 'passed'
  snapshot.channels[1].status = 'failed'
  snapshot.channels[2].status = 'idle'
  for (const width of [80, 100]) {
    const rendered = renderView(snapshot, width, 12)
    const lines = rendered.split(NewlineCharacter)
    Tests.expect(lines.length).toBeLessThanOrEqual(12)
    Tests.expect(lines.every(line => line.length <= width)).toBe(true)
    for (const channel of snapshot.channels) {
      Tests.expect(rendered).toContain(channel.title)
    }
    Tests.expect(rendered).toContain('✓ TypeScript tests')
    Tests.expect(rendered).toContain('✗ TypeScript shard 1')
    Tests.expect(rendered).toContain('○ TypeScript shard 2')
    Tests.expect(rendered).toContain('● Run')
    Tests.expect(lines.at(-1)).toBe('Commands: quit')
  }
})

Tests.test('worker overflow is summarized within capacity and tiny terminals retain the footer', () => {
  const snapshot = workerSnapshot()
  const rendered = renderView(snapshot, 80, 8)
  Tests.expect(rendered.split(NewlineCharacter).length).toBeLessThanOrEqual(8)
  Tests.expect(rendered).toContain('TypeScript tests')
  Tests.expect(rendered).toContain('4 more channels')
  Tests.expect(rendered.trimEnd()).toEndWith('Commands: quit')
  Tests.expect(renderView(snapshot, 80, 2)).toBe('● Run 0:12\nCommands: quit')
  Tests.expect(renderView(snapshot, 80, 1)).toBe('Commands: quit')
})

function workerSnapshot(): OutputSnapshot {
  const titles = [
    'TypeScript tests',
    'TypeScript shard 1',
    'TypeScript shard 2',
    'TypeScript shard 3',
    'Tao worker 1',
    'Tao worker 2',
    'Tao worker 3',
  ]
  const channels: ChannelState[] = titles.map(title => ({
    title,
    status: 'running',
    lines: ['ts/0-workspace/test-workspace/sidecars/ManagedMetroAcceptance.test.ts'],
    startedAtMs: 0,
  }))
  return {
    main: { title: 'Run', status: 'running', lines: ['Preparing test workers'], startedAtMs: 0 },
    channels,
    commands: [{ key: 'q', label: 'quit' }],
  }
}

function renderView(snapshot: OutputSnapshot, width: number, height: number): string {
  const view = React.createElement(OutputView, { snapshot, now: 12_000, width, height })
  return Text.stripAnsi(Ink.renderToString(view))
}

Tests.test('active prompt text stays in the root pane within crowded and single-row terminal budgets', () => {
  const snapshot = workerSnapshot()
  snapshot.prompt = 'Set up dependencies and continue? [Y/n] '
  const rendered = renderView(snapshot, 80, 12)
  const lines = rendered.split(NewlineCharacter)
  Tests.expect(lines.length).toBeLessThanOrEqual(12)
  Tests.expect(lines.every(line => line.length <= 80)).toBe(true)
  const promptLine = lines.find(line => line.includes('[Y/n]'))!
  Tests.expect(promptLine).toStartWith('│')
  Tests.expect(promptLine).toEndWith('│')
  Tests.expect(rendered.trimEnd()).toEndWith('Commands: quit')
  Tests.expect(renderView(snapshot, 80, 1)).toBe('Set up dependencies and continue? [Y/n]')
})
