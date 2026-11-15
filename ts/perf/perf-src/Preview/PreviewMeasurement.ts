import { Errors, NewlineCharacter, S } from '@shared'
import { Env, type HeadlessBrowser } from '@shared/os'
import * as Render from './PreviewRenderSteps'
import type { PreviewScenario } from './PreviewScenarios'

/** PreviewMeasurement describes the repetitions and fixed generated Tao source shape. */
export type PreviewMeasurement = {
  editCount: number
  frameCount: PreviewFrameCount
  extraViews: number
  extraFileCount: number
}

/** PreviewRunOptions selects repetitions and frame count for the fixed performance project. */
export type PreviewRunOptions = { editCount?: number; frameCount?: PreviewFrameCount }

/** PreviewFrameCount selects the supported single-frame or dual-frame measurement. */
export type PreviewFrameCount = 1 | 2

/** PreviewMeasurementProtocol identifies the comparable preview launch and edit workload. */
export const PreviewMeasurementProtocol = 'preview-render-transitions-v3'

/** PreviewCycleSize is the number of edits required for one complete render cycle. */
export const PreviewCycleSize = Render.PreviewRenderSteps.length

/** DefaultPreviewEditCount supplies one first cycle and two warm cycles. */
export const DefaultPreviewEditCount = PreviewCycleSize * 3

/** PreviewReopenCount is the number of fresh preview opens on an already running host. */
export const PreviewReopenCount = 3

/** MeasurementFile is one generated sibling Tao module. */
export type MeasurementFile = { name: string; source: string }

/** readPreviewMeasurement resolves explicit settings or documented measurement environment values. */
export function readPreviewMeasurement(options: PreviewRunOptions = {}): PreviewMeasurement {
  const editCount = options.editCount ?? readCount('TAO_PREVIEW_EDIT_COUNT', DefaultPreviewEditCount)
  const frameCount = options.frameCount ?? readCount('TAO_PREVIEW_FRAME_COUNT', 2)
  if (!isValidEditCount(editCount)) {
    Errors.ThrowUserInput(`Preview edit count must be a positive multiple of ${PreviewCycleSize}.`)
  }
  if (frameCount !== 1 && frameCount !== 2) {
    Errors.ThrowUserInput('Preview frame count must be one or two.')
  }
  return {
    editCount,
    frameCount,
    extraViews: FixtureFileCount * Render.PreviewViewsPerFile,
    extraFileCount: FixtureFileCount,
  }
}

/** createMeasurementScenarios repeats real source edits with unique text in each measured cycle. */
export function createMeasurementScenarios(settings: PreviewMeasurement): readonly PreviewScenario[] {
  return Array.from(
    { length: settings.editCount / PreviewCycleSize },
    (_, index) => Render.createPreviewRenderCycle(index + 1),
  ).flat()
}

/** MeasurementSource holds the entry and generated sibling inputs of a preview measurement. */
export type MeasurementSource = {
  entry: string
  extraFiles: readonly MeasurementFile[]
}

const FixtureFileCount = 24
const FilesPerGroup = 4

/** createMeasurementFiles builds the same module graph in every preview performance project. */
export function createMeasurementFiles(source: string): MeasurementSource {
  const entry = `${importModules(Render.PreviewImportGroupRoots)}${NewlineCharacter}${source}`
  const extraFiles = Array.from({ length: FixtureFileCount }, (_, index) => {
    const dependencies = index % FilesPerGroup === 0
      ? Array.from({ length: FilesPerGroup - 1 }, (_, child) => index + child + 1)
      : []
    return { name: `LoadViews${index}`, source: createViewModule(index, dependencies) }
  })
  return { entry, extraFiles }
}

function importModules(indices: readonly number[]): string {
  return indices.map(index => `use ./LoadViews${index} Load${index * Render.PreviewViewsPerFile}${NewlineCharacter}`)
    .join('')
}

/** assertMeasurementScenario proves each configured preview rendered the actual requested edit. */
export async function assertMeasurementScenario(
  page: HeadlessBrowser.Page,
  name: string,
  settings: PreviewMeasurement,
): Promise<void> {
  for (const frameId of measurementFrameIds(settings.frameCount)) {
    await Render.assertPreviewRender(page.frameLocator(`#${frameId}`), name)
  }
}

/** measurementFrameIds returns the exact configured receipt quorum. */
export function measurementFrameIds(frameCount: PreviewFrameCount): readonly string[] {
  return frameCount === 1 ? ['left'] : ['left', 'right']
}

/** describeMeasurement labels first-edit and warm sample boundaries without mixing startup into edits. */
export function describeMeasurement(settings: PreviewMeasurement): MeasurementDescription {
  return {
    ...settings,
    protocol: PreviewMeasurementProtocol,
    firstEditIndex: 0,
    warmStartIndex: PreviewCycleSize,
    warmEditCount: Math.max(0, settings.editCount - PreviewCycleSize),
    warmDefinition: 'Exclude the first complete render cycle; first edit is recorded separately.',
    largeSource: 'The fixed graph is compiled for every edit. Each step mounts a specified subset.',
    extraFileDefinition: 'Six imported module groups each reference three additional Tao modules.',
  }
}

/** MeasurementDescription records the configured workload and its sample boundaries. */
export type MeasurementDescription = PreviewMeasurement & {
  protocol: typeof PreviewMeasurementProtocol
  firstEditIndex: number
  warmStartIndex: number
  warmEditCount: number
  warmDefinition: string
  largeSource: string
  extraFileDefinition: string
}

/** MeasurementSample identifies first-edit, first-cycle or warm session evidence. */
export type MeasurementSample = 'first-edit' | 'first-cycle' | 'warm'

/** classifyMeasurementSample distinguishes the first edit, remaining first cycle and warm edits. */
export function classifyMeasurementSample(index: number): MeasurementSample {
  if (index === 0) {
    return 'first-edit'
  }
  return index < PreviewCycleSize ? 'first-cycle' : 'warm'
}

/** isValidEditCount requires complete render cycles. */
export function isValidEditCount(count: number): boolean {
  return Number.isInteger(count) && count >= PreviewCycleSize && count % PreviewCycleSize === 0
}

function createViewModule(file: number, children: readonly number[]): string {
  const start = file * Render.PreviewViewsPerFile
  const declarations = Array.from({ length: Render.PreviewViewsPerFile }, (_, index) => {
    const id = start + index
    const items = index === 0 ? importedChildren(file, children) : [`Text("Load ${id}")`]
    return `public ${createViewDeclaration(id, items)}`
  })
  return S`
    use tao@ui Col, Text
    ${importModules(children)}
    ${declarations.join('\n\n')}
  `
}

function importedChildren(file: number, children: readonly number[]): string[] {
  if (children.length === 0) {
    return [`Text("Imported leaf ${file}")`, `Load${file * Render.PreviewViewsPerFile + 1}`]
  }
  return [`Text("Imported group ${file}")`, ...children.map(child => `Load${child * Render.PreviewViewsPerFile}`)]
}

function createViewDeclaration(index: number, items: readonly string[]): string {
  const body = items.join(NewlineCharacter + '    ')
  return S`
    view Load${index} {
      render Col {
        ${body}
      }
    }
  `
}

function readCount(name: string, fallback: number): number {
  const value = Env.get(name)
  return value === undefined ? fallback : Number(value)
}
