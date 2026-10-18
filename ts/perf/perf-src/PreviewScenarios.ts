import { Errors } from '@shared'

/** PreviewScenario is one named source edit in a preview button cycle. */
export type PreviewScenario = {
  name: string
  apply(source: string, canonical: string): string
}

/** helloWorldScenarios edits the Hello World fixture through the performance preview cycle. */
export const helloWorldScenarios: readonly PreviewScenario[] = [
  { name: 'text', apply: source => source.replace('Hello World', 'Hello Tao') },
  {
    name: 'add-text',
    apply: source => source.replace('Text("Hello Tao")', 'Text("Hello Tao")\n    Text("Second view")'),
  },
  { name: 'row', apply: source => source.replace('render Col {', 'render Row {') },
]

/** previewScenarios edits the isolated Preview app: label, second line, row, then the authored source. */
export const previewScenarios: readonly PreviewScenario[] = [
  { name: 'label', apply: source => replaceOnce(source, 'Text("Ready")', 'Text("Editing")') },
  { name: 'detail', apply: source => replaceOnce(source, 'Text("Editing")', 'Text("Editing")\n    Text("Detail")') },
  { name: 'row', apply: source => replaceOnce(source, 'render Col {', 'render Row {') },
  { name: 'reset', apply: (_source, canonical) => canonical },
]

/** applyScenario runs one named edit, rejecting a step the current source cannot accept. */
export function applyScenario(
  scenarios: readonly PreviewScenario[],
  name: string | undefined,
  source: string,
  canonical: string,
): string {
  const scenario = scenarios.find(item => item.name === name)
  if (!scenario) {
    return Errors.ThrowUserInput('Unknown preview performance scenario: ' + String(name))
  }
  return scenario.apply(source, canonical)
}

function replaceOnce(source: string, from: string, to: string): string {
  if (!source.includes(from)) {
    return Errors.ThrowUserInput('Preview edit did not match the current source: ' + from)
  }
  return source.replace(from, to)
}
