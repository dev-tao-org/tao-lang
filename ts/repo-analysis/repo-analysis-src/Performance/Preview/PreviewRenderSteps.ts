import { Errors, NewlineCharacter, Regxs, S, UserInput } from '@shared'
import type { HeadlessBrowser } from '@shared/os'

import type { PreviewScenario } from './PreviewScenarios'

/** PreviewRenderStep describes the mounted workload of one measured transition. */
export type PreviewRenderStep = {
  name: string
  label: string
  localBranches: number
  importedSets: number
}

/** PreviewRenderSteps lists the eight transitions in one deterministic measurement cycle. */
export const PreviewRenderSteps: readonly PreviewRenderStep[] = [
  { name: 'text', label: 'Small text edit', localBranches: 0, importedSets: 0 },
  { name: 'local-expand', label: 'Expand same-file tree', localBranches: 64, importedSets: 0 },
  { name: 'local-shrink', label: 'Shrink same-file tree', localBranches: 0, importedSets: 0 },
  { name: 'imported-mount', label: 'Mount small imported tree', localBranches: 0, importedSets: 1 },
  { name: 'imported-expand', label: 'Expand imported tree', localBranches: 0, importedSets: 8 },
  { name: 'dependency-edit', label: 'Edit mounted dependency', localBranches: 0, importedSets: 8 },
  { name: 'imported-shrink', label: 'Shrink imported tree', localBranches: 0, importedSets: 1 },
  { name: 'reset', label: 'Return to minimal view', localBranches: 0, importedSets: 0 },
]

/** PreviewImportGroupRoots identifies the entry's six imported branches. */
export const PreviewImportGroupRoots = [0, 4, 8, 12, 16, 20] as const

/** PreviewViewsPerFile keeps the imported view references aligned with the fixture generator. */
export const PreviewViewsPerFile = 10

/** previewRenderStepName removes the cycle suffix from a recorded edit. */
export function previewRenderStepName(scenario: string): string {
  return scenario.replace(Regxs.MeasurementScenarioCycleSuffixRegx, '')
}

/** createPreviewRenderCycle prepares complete source edits in measurement order. */
export function createPreviewRenderCycle(cycle: number): PreviewScenario[] {
  return PreviewRenderSteps.map(step => {
    const name = `${step.name}-${cycle}`
    if (step.name === 'dependency-edit') {
      return { name, path: 'LoadViews1.tao', apply: source => editDependency(source, cycle) }
    }
    return { name, apply: (_source, canonical) => renderEntry(canonical, step, cycle) }
  })
}

/** assertPreviewRender verifies the mounted size and nested dependency in both stages of an edit. */
export async function assertPreviewRender(frame: HeadlessBrowser.FrameLocator, scenario: string): Promise<void> {
  const stepName = previewRenderStepName(scenario)
  const step = PreviewRenderSteps.find(candidate => candidate.name === stepName)
  if (!step) {
    Errors.ThrowShouldNeverHappen(`Unknown preview render step: ${scenario}`)
  }
  const cycle = Number(scenario.slice(step.name.length + 1))
  const marker = step.name === 'dependency-edit' ? `Imported edit ${cycle}` : entryMarker(step, cycle)
  await frame.getByText(marker, { exact: true }).first().waitFor()
  await requireRenderCount(frame, 'Local nested item', step.localBranches)
  for (const root of PreviewImportGroupRoots) {
    await requireRenderCount(frame, `Imported group ${root}`, step.importedSets)
  }
  await requireImportedLeaves(frame, step.importedSets)
  if (step.name === 'dependency-edit') {
    await requireRenderCount(frame, marker, step.importedSets)
  }
}

const InitialMarker = 'Hello World'
const LocalBranch = S`
  Col {
    Text("Local item")
    Row {
      Text("Local nested item")
    }
  }
`
const RenderIndent = '    '

function renderEntry(canonical: string, step: PreviewRenderStep, cycle: number): string {
  const marker = `Text("${InitialMarker}")`
  UserInput.Require(!!canonical.includes(marker), 'Performance entry is missing its initial render marker.')
  const blocks = [`Text("${entryMarker(step, cycle)}")`]
  blocks.push(...Array.from({ length: step.localBranches }, () => LocalBranch))
  const branches = PreviewImportGroupRoots.map(root => `Load${root * PreviewViewsPerFile}`)
  for (let index = 0; index < step.importedSets; index++) {
    blocks.push(...branches)
  }
  const rendered = blocks.join(NewlineCharacter).replaceAll(NewlineCharacter, NewlineCharacter + RenderIndent)
  return canonical.replace(marker, rendered)
}

function entryMarker(step: PreviewRenderStep, cycle: number): string {
  return step.name === 'reset' ? InitialMarker : `Render ${step.label} ${cycle}`
}

function editDependency(source: string, cycle: number): string {
  return source.replace(Regxs.PreviewDependencyLabelRegx, `Text("Imported edit ${cycle}")`)
}

const ImportedLeafFiles = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 19, 21, 22, 23]

async function requireImportedLeaves(frame: HeadlessBrowser.FrameLocator, expected: number): Promise<void> {
  await Promise.all(ImportedLeafFiles.map(file => {
    const label = `Load ${file * PreviewViewsPerFile + 1}`
    return requireRenderCount(frame, label, expected)
  }))
}

async function requireRenderCount(frame: HeadlessBrowser.FrameLocator, text: string, expected: number): Promise<void> {
  const count = await frame.getByText(text, { exact: true }).count()
  if (count !== expected) {
    Errors.ThrowShouldNeverHappen(`Preview mounted ${count} instances of ${text}, expected ${expected}.`)
  }
}
