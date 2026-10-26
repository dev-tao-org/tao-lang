import { Errors, S } from '@shared'
import { Env, type HeadlessBrowser } from '@shared/os'
import { helloWorldScenarios, type PreviewScenario } from './PreviewScenarios'

/** PreviewMeasurement selects repeated edit volume, active previews and generated source size. */
export type PreviewMeasurement = { editCount: number; frameCount: 1 | 2; extraViews: number }

/** readPreviewMeasurement resolves explicit settings or documented measurement environment values. */
export function readPreviewMeasurement(options: Partial<PreviewMeasurement> = {}): PreviewMeasurement {
  const editCount = options.editCount ?? readCount('TAO_PREVIEW_EDIT_COUNT', 4)
  const frameCount = options.frameCount ?? readCount('TAO_PREVIEW_FRAME_COUNT', 2)
  const extraViews = options.extraViews ?? readCount('TAO_PREVIEW_EXTRA_VIEWS', 0)
  if (!isValidEditCount(editCount)) {
    Errors.ThrowUserInput('Preview edit count must be a positive multiple of four.')
  }
  if (frameCount !== 1 && frameCount !== 2) {
    Errors.ThrowUserInput('Preview frame count must be one or two.')
  }
  if (!Number.isInteger(extraViews) || extraViews < 0) {
    Errors.ThrowUserInput('Preview extra view count must be a nonnegative integer.')
  }
  return { editCount, frameCount, extraViews }
}

/** createMeasurementScenarios repeats real source edits with unique text in each measured cycle. */
export function createMeasurementScenarios(settings: PreviewMeasurement): readonly PreviewScenario[] {
  if (settings.editCount === 4) {
    return helloWorldScenarios
  }
  return Array.from({ length: settings.editCount / 4 }, (_, index) => createCycle(index + 1)).flat()
}

/** createMeasurementSource appends compiled but unrendered view declarations to the canonical fixture. */
export function createMeasurementSource(source: string, settings: PreviewMeasurement): string {
  const declarations = Array.from(
    { length: settings.extraViews },
    (_, index) =>
      S`
        view Load${index} {
          render Col {
            Text("Load ${index}")
          }
        }
      `,
  )
  return declarations.length ? source + '\n' + declarations.join('\n\n') + '\n' : source
}

/** assertMeasurementScenario proves each configured preview rendered the actual requested edit. */
export async function assertMeasurementScenario(
  page: HeadlessBrowser.Page,
  name: string,
  settings: PreviewMeasurement,
): Promise<void> {
  const scenario = name.replace(/-\d+$/, '')
  const suffix = settings.editCount === 4 ? '' : ' ' + name.match(/\d+$/)![0]
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
export function measurementFrameIds(frameCount: 1 | 2): readonly string[] {
  return frameCount === 1 ? ['left'] : ['left', 'right']
}

/** describeMeasurement labels first-edit and warm sample boundaries without mixing startup into edits. */
export function describeMeasurement(settings: PreviewMeasurement) {
  return {
    ...settings,
    firstEditIndex: 0,
    warmStartIndex: 4,
    warmEditCount: Math.max(0, settings.editCount - 4),
    warmDefinition: 'Exclude the first complete four-edit cycle; first edit is recorded separately.',
    largeSource: 'Extra view declarations compile into output but are not mounted in the app.',
  }
}

function readCount(name: string, fallback: number): number {
  const value = Env.get(name)
  return value === undefined ? fallback : Number(value)
}

function isValidEditCount(count: number): boolean {
  return Number.isInteger(count) && count >= 4 && count % 4 === 0
}

function createCycle(cycle: number): PreviewScenario[] {
  const label = `Hello Tao ${cycle}`
  const detail = `Second view ${cycle}`
  return [
    { name: `text-${cycle}`, apply: source => source.replace('Hello World', label) },
    {
      name: `add-text-${cycle}`,
      apply: source => source.replace(`Text("${label}")`, `Text("${label}")\n    Text("${detail}")`),
    },
    { name: `row-${cycle}`, apply: source => source.replace('render Col {', 'render Row {') },
    { name: `reset-${cycle}`, apply: (_source, canonical) => canonical },
  ]
}

async function assertReset(frame: HeadlessBrowser.FrameLocator, frameId: string): Promise<void> {
  await frame.getByText('Hello World', { exact: true }).waitFor()
  const edited = await frame.getByText(/^Hello Tao(?: \d+)?$/).count()
  const added = await frame.getByText(/^Second view(?: \d+)?$/).count()
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
