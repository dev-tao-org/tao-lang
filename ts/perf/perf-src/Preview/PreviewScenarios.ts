import { Errors, S } from '@shared'

/** PreviewScenario is one named source edit in a preview button cycle. */
export type PreviewScenario = {
  name: string
  apply(source: string, canonical: string): string
}

/** performanceScenarios edits the minimal benchmark fixture through the preview cycle. */
export const performanceScenarios: readonly PreviewScenario[] = [
  { name: 'text', apply: source => source.replace('Hello World', 'Hello Tao') },
  {
    name: 'add-text',
    apply: addBenchmarkText,
  },
  { name: 'row', apply: source => source.replace('render Col {', 'render Row {') },
  { name: 'reset', apply: (_source, canonical) => canonical },
]

/** previewScenarios edits the isolated Preview app: label, second line, row, then the authored source. */
export const previewScenarios: readonly PreviewScenario[] = [
  { name: 'label', apply: source => replaceOnce(source, 'Text("Ready")', 'Text("Editing")') },
  { name: 'detail', apply: addPreviewDetail },
  { name: 'row', apply: source => replaceOnce(source, 'render Col {', 'render Row {') },
  { name: 'reset', apply: (_source, canonical) => canonical },
]

type OptionalScenarioName = string | undefined
/** applyScenario runs one named edit, rejecting a step the current source cannot accept. */
export function applyScenario(
  scenarios: readonly PreviewScenario[],
  name: OptionalScenarioName,
  source: string,
  canonical: string,
): string {
  const scenario = scenarios.find(item => item.name === name)
  if (!scenario) {
    return Errors.ThrowUserInput('Unknown preview performance scenario: ' + String(name))
  }
  return scenario.apply(source, canonical)
}

function addBenchmarkText(source: string): string {
  return source.replace(
    'Text("Hello Tao")',
    S`
      Text("Hello Tao")
          Text("Second view")
    `,
  )
}

function addPreviewDetail(source: string): string {
  return replaceOnce(
    source,
    'Text("Editing")',
    S`
      Text("Editing")
          Text("Detail")
    `,
  )
}

function replaceOnce(source: string, from: string, to: string): string {
  if (!source.includes(from)) {
    return Errors.ThrowUserInput('Preview edit did not match the current source: ' + from)
  }
  return source.replace(from, to)
}
