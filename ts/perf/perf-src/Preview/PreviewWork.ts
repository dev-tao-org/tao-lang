import { Lists, type TimingSample } from '@shared'
import type * as Preview from '@shared/preview'

type GeneratedSource = Readonly<Record<string, string>>
type PublishedSource = GeneratedSource | undefined

/** GeneratedChanges counts differing generated paths in successive complete publications. */
export type GeneratedChanges = { added: number; modified: number; deleted: number }

/** PreviewEditTrace records the local harness timeline and publication work for one submitted edit. */
export type PreviewEditTrace = {
  receivedAtMs: number
  writeStartedAtMs: number
  writtenAtMs: number
  changes?: GeneratedChanges
}

/** PreviewScenarioResult carries browser measurements for one submitted edit and its frames. */
export type PreviewScenarioResult = {
  scenario: string
  revision: string
  clickTime: number
  clickTimestampMs: number
  timings: unknown[]
  editTrace: PreviewEditTrace
  stages?: unknown
  outcome?: Preview.PreviewOutcome
  frames: PreviewScenarioFrames
}

type PreviewScenarioFrames = Record<string, {
  clickToHmrMs: number
  hmrToAppliedMs: number
  clickToAppliedMs: number
  hmrTimestampMs: number
  appliedTimestampMs: number
  hmrTimings: unknown[]
  appliedTimings: unknown[]
  metroDeltaModules?: number
}>

/** PreviewWork counts operations performed for one preview edit. */
export type PreviewWork = {
  moduleDiscoveries: number
  parses: number
  modulesEmitted: number
  generatedPathsChanged?: number
  metroDeltaModules?: number
}

/** describeGeneratedChanges compares the same snapshots that are sent to Metro. */
export function describeGeneratedChanges(
  previous: PublishedSource,
  current: PublishedSource,
): GeneratedChanges | undefined {
  if (!previous || !current) {
    return undefined
  }
  const changes = { added: 0, modified: 0, deleted: 0 }
  for (const path of Lists.unique(Object.keys(previous), Object.keys(current))) {
    const before = previous[path]
    const after = current[path]
    if (before === after) {
      continue
    }
    if (before === undefined) {
      changes.added++
    } else if (after === undefined) {
      changes.deleted++
    } else {
      changes.modified++
    }
  }
  return changes
}

type FrameDeltaCount = number | undefined

/** describePreviewWork derives compiler, generated snapshot and delivered Metro work counts. */
export function describePreviewWork(
  timings: readonly TimingSample[],
  editTrace: PreviewEditTrace,
  frameDeltas: FrameDeltaCount[],
): PreviewWork {
  const changed = editTrace.changes
  const metroDeltaModules = frameDeltas.length && frameDeltas.every(delta => delta !== undefined)
    ? Math.max(...frameDeltas)
    : undefined
  return {
    moduleDiscoveries: countSucceeded(timings, 'modules.discover'),
    parses: countSucceeded(timings, 'parser.parse'),
    modulesEmitted: countSucceeded(timings, 'compiler.emit-module'),
    generatedPathsChanged: changed ? changed.added + changed.modified + changed.deleted : undefined,
    metroDeltaModules,
  }
}

function countSucceeded(timings: readonly TimingSample[], name: string): number {
  return timings.filter(sample => sample.name === name && sample.status === 'succeeded').length
}
