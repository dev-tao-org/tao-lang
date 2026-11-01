import type { TimingSample } from '@shared'
import { NewlineCharacter } from '@shared'

/** formatTimings formats recorded pipeline spans for compiler and retained-loop output. */
export function formatTimings(samples: readonly TimingSample[]): string {
  const startedAtMs = samples[0]?.startMs ?? 0
  return samples.map(sample => {
    const elapsedSeconds = (sample.startMs + sample.durationMs - startedAtMs) / 1000
    return `${names[sample.name] ?? sample.name}: ${sample.durationMs.toFixed(2)} ms `
      + `(${elapsedSeconds.toFixed(4)} s elapsed)${sample.status === 'failed' ? ' (failed)' : ''}`
  }).join(NewlineCharacter + '  ')
}

type TimingLabels = Record<string, string>

const names: TimingLabels = {
  'workspace.observe-to-read': 'observe → read',
  'workspace.read': 'read',
  'workspace.queue': 'queue',
  'parser.parse': 'parse',
  'transformer.transform': 'AST',
  'compiler.generate': 'codegen',
  'workspace.publish': 'write',
}
