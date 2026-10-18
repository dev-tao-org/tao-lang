import { FileSystem, Path } from '@shared/os'

/** writeCSTTypes derives field names and directly owned tokens from the generated grammar. */
export async function writeCSTTypes(directory: string): Promise<void> {
  const grammar = JSON.parse(await FileSystem.readFile(Path.join(directory, 'src/grammar.json'), 'utf8')) as {
    rules: Record<string, Rule>
  }
  const nodes = JSON.parse(await FileSystem.readFile(Path.join(directory, 'src/node-types.json'), 'utf8')) as {
    type: string
    named: boolean
    fields?: Record<string, unknown>
  }[]
  const members = nodes.filter(node => node.named).map(node => {
    const fields = union(Object.keys(node.fields ?? {}))
    const tokens = union(ownedTokens(grammar.rules[node.type]))
    return `  ${JSON.stringify(node.type)}: { fields: ${fields}; tokens: ${tokens} }`
  })
  await FileSystem.writeIfChanged(
    Path.join(directory, 'CST.ts'),
    `// @generated from Tree-sitter node-types.json and grammar.json.\nexport interface NodeTypes {\n${
      members.join('\n')
    }\n}\n`,
  )
}

type Rule = { type: string; value?: string; content?: Rule; members?: Rule[] }

function ownedTokens(rule: Rule | undefined): string[] {
  if (!rule || rule.type === 'SYMBOL') {
    return []
  }
  if (rule.type === 'STRING') {
    return [rule.value!]
  }
  return [...ownedTokens(rule.content), ...rule.members?.flatMap(ownedTokens) ?? []]
}

function union(values: readonly string[]): string {
  return [...new Set(values)].map(value => JSON.stringify(value)).join(' | ') || 'never'
}
