import { Errors, S } from '@shared'

/** PreviewScenario is one named source edit in a preview button cycle. */
export type PreviewScenario = {
  name: string
  path?: string
  apply(source: string, canonical: string): string
}

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
  return requirePreviewScenario(scenarios, name).apply(source, canonical)
}

/** requirePreviewScenario resolves an exact edit before the harness chooses its source file. */
export function requirePreviewScenario(
  scenarios: readonly PreviewScenario[],
  name: OptionalScenarioName,
): PreviewScenario {
  const scenario = scenarios.find(item => item.name === name)
  if (!scenario) {
    return Errors.ThrowUserInput('Unknown preview performance scenario: ' + String(name))
  }
  return scenario
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
