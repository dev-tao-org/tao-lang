import { Errors, NewlineCharacter, S } from '@shared'
import { Env, type HeadlessBrowser } from '@shared/os'
import { performanceScenarios, type PreviewScenario } from './PreviewScenarios'

/** PreviewMeasurement selects edit volume, preview frames and generated Tao source shape. */
export type PreviewMeasurement = {
  editCount: number
  frameCount: PreviewFrameCount
  extraViews: number
  extraFileCount: number
}

/** PreviewFrameCount selects the supported single-frame or dual-frame measurement. */
export type PreviewFrameCount = 1 | 2

/** MeasurementFile is one generated sibling Tao module. */
export type MeasurementFile = { name: string; source: string }

/** readPreviewMeasurement resolves explicit settings or documented measurement environment values. */
export function readPreviewMeasurement(options: Partial<PreviewMeasurement> = {}): PreviewMeasurement {
  const editCount = options.editCount ?? readCount('TAO_PREVIEW_EDIT_COUNT', 4)
  const frameCount = options.frameCount ?? readCount('TAO_PREVIEW_FRAME_COUNT', 2)
  const extraViews = options.extraViews ?? readCount('TAO_PREVIEW_EXTRA_VIEWS', 0)
  const extraFileCount = options.extraFileCount ?? readCount('TAO_PREVIEW_EXTRA_FILE_COUNT', 0)
  if (!isValidEditCount(editCount)) {
    Errors.ThrowUserInput('Preview edit count must be a positive multiple of four.')
  }
  if (frameCount !== 1 && frameCount !== 2) {
    Errors.ThrowUserInput('Preview frame count must be one or two.')
  }
  if (!Number.isInteger(extraViews) || extraViews < 0) {
    Errors.ThrowUserInput('Preview extra view count must be a nonnegative integer.')
  }
  if (!Number.isInteger(extraFileCount) || extraFileCount < 0) {
    Errors.ThrowUserInput('Preview extra file count must be a nonnegative integer.')
  }
  return { editCount, frameCount, extraViews, extraFileCount }
}

/** createMeasurementScenarios repeats real source edits with unique text in each measured cycle. */
export function createMeasurementScenarios(settings: PreviewMeasurement): readonly PreviewScenario[] {
  if (settings.editCount === 4) {
    return performanceScenarios
  }
  return Array.from({ length: settings.editCount / 4 }, (_, index) => createCycle(index + 1)).flat()
}

/** createMeasurementFiles distributes compiled but unrendered views across optional sibling Tao modules. */
export function createMeasurementFiles(source: string, settings: PreviewMeasurement): {
  entry: string
  extraFiles: readonly MeasurementFile[]
} {
  const fileCount = Math.min(settings.extraViews, settings.extraFileCount)
  if (fileCount === 0) {
    return { entry: appendViews(source, 0, settings.extraViews), extraFiles: [] }
  }
  const imports = Array.from({ length: fileCount }, (_, index) => `use package ./LoadViews${index}`).join(
    NewlineCharacter,
  )
  const entry = appendViews(`${imports}${NewlineCharacter}${source}`, 0, 0)
  const baseCount = Math.floor(settings.extraViews / fileCount)
  const remainder = settings.extraViews % fileCount
  const extraFiles = Array.from({ length: fileCount }, (_, index) => {
    const start = index * baseCount + Math.min(index, remainder)
    const count = baseCount + (index < remainder ? 1 : 0)
    return { name: `LoadViews${index}`, source: createViewModule(start, count) }
  })
  return { entry, extraFiles }
}

const MeasurementScenarioSuffixRegx = /-\d+$/
const MeasurementScenarioNumberRegx = /\d+$/
/** assertMeasurementScenario proves each configured preview rendered the actual requested edit. */
export async function assertMeasurementScenario(
  page: HeadlessBrowser.Page,
  name: string,
  settings: PreviewMeasurement,
): Promise<void> {
  const scenario = name.replace(MeasurementScenarioSuffixRegx, '')
  const suffix = settings.editCount === 4 ? '' : ' ' + name.match(MeasurementScenarioNumberRegx)![0]
  const label = 'Hello Tao' + suffix
  const detail = 'Second view' + suffix
  for (const frameId of measurementFrameIds(settings.frameCount)) {
    const frame = page.frameLocator(`#${frameId}`)
    if (scenario === 'reset') {
      await assertReset(frame, frameId)
    } else {
      await frame.getByText(label, { exact: true }).waitFor()
      if (scenario !== 'text') {
        await frame.getByText(detail, { exact: true }).waitFor()
      }
      if (scenario === 'row' && !await hasRowLayout(frame, label, detail)) {
        Errors.ThrowShouldNeverHappen(`${frameId} frame did not render the requested Row layout.`)
      }
    }
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
    firstEditIndex: 0,
    warmStartIndex: 4,
    warmEditCount: Math.max(0, settings.editCount - 4),
    warmDefinition: 'Exclude the first complete four-edit cycle; first edit is recorded separately.',
    largeSource: 'Extra view declarations compile into output but are not mounted in the app.',
    extraFileDefinition: 'Extra file count partitions extra view declarations across imported sibling Tao modules.',
  }
}

/** MeasurementDescription records the configured workload and its sample boundaries. */
export type MeasurementDescription = PreviewMeasurement & {
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
  return index < 4 ? 'first-cycle' : 'warm'
}

/** isValidEditCount requires complete four-edit preview cycles. */
export function isValidEditCount(count: number): boolean {
  return Number.isInteger(count) && count >= 4 && count % 4 === 0
}

function appendViews(source: string, start: number, count: number): string {
  const declarations = Array.from({ length: count }, (_, index) => createViewDeclaration(start + index))
  return declarations.length
    ? source + NewlineCharacter + declarations.join(NewlineCharacter + NewlineCharacter) + NewlineCharacter
    : source
}

function createViewModule(start: number, count: number): string {
  const declarations = Array.from({ length: count }, (_, index) => `public ${createViewDeclaration(start + index)}`)
  return S`
    use tao@ui Col, Text
    ${declarations.join('\n\n')}
  `
}

function createViewDeclaration(index: number): string {
  return S`
    view Load${index} {
      render Col {
        Text("Load ${index}")
      }
    }
  `
}

function readCount(name: string, fallback: number): number {
  const value = Env.get(name)
  return value === undefined ? fallback : Number(value)
}

function createCycle(cycle: number): PreviewScenario[] {
  const label = `Hello Tao ${cycle}`
  const detail = `Second view ${cycle}`
  return [
    { name: `text-${cycle}`, apply: source => source.replace('Hello World', label) },
    {
      name: `add-text-${cycle}`,
      apply: source =>
        source.replace(
          `Text("${label}")`,
          S`
            Text("${label}")
                Text("${detail}")
          `,
        ),
    },
    { name: `row-${cycle}`, apply: source => source.replace('render Col {', 'render Row {') },
    { name: `reset-${cycle}`, apply: (_source, canonical) => canonical },
  ]
}

const EditedViewLabelRegx = /^Hello Tao(?: \d+)?$/
const AddedViewLabelRegx = /^Second view(?: \d+)?$/
async function assertReset(frame: HeadlessBrowser.FrameLocator, frameId: string): Promise<void> {
  await frame.getByText('Hello World', { exact: true }).waitFor()
  const edited = await frame.getByText(EditedViewLabelRegx).count()
  const added = await frame.getByText(AddedViewLabelRegx).count()
  if (edited || added) {
    Errors.ThrowShouldNeverHappen(`${frameId} frame retained an edited view after reset.`)
  }
}

async function hasRowLayout(frame: HeadlessBrowser.FrameLocator, label: string, detail: string): Promise<boolean> {
  return await frame.getByText(label, { exact: true }).evaluate((first, detail) => {
    const parent = first.parentElement
    const second = parent && [...parent.children].find(node => node.textContent === detail)
    return !!second && getComputedStyle(parent!).flexDirection === 'row'
  }, detail)
}
