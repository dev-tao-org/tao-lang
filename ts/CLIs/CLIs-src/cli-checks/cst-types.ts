import { FileSystem, Path } from '@shared/os'
import * as GrammarTraversal from './grammar-traversal'

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
    const directTokens = GrammarTraversal.collectOwnedTokens(grammar.rules[node.type])
    const aliasedTokensForNode = aliasedTokens(grammar.rules, node.type)
    const tokens = union([...directTokens, ...aliasedTokensForNode])
    return `  ${JSON.stringify(node.type)}: { fields: ${fields}; tokens: ${tokens} }`
  })
  await FileSystem.writeIfChanged(
    Path.join(directory, 'CST.ts'),
    `// @generated from Tree-sitter node-types.json and grammar.json.\nexport interface NodeTypes {\n${
      members.join('\n')
    }\n}\n`,
  )
}

type Rule = GrammarTraversal.GrammarRule & { name?: string; named?: boolean; content?: Rule; members?: Rule[] }

function aliasedTokens(rules: Record<string, Rule>, nodeType: string): string[] {
  return Object.values(rules).flatMap(rule =>
    findAliases(rule, nodeType).flatMap(alias => {
      const content = alias.content
      const source = content?.type === 'SYMBOL' ? rules[content.name!] : content
      return GrammarTraversal.collectOwnedTokens(source)
    })
  )
}

function findAliases(rule: Rule | undefined, nodeType: string): Rule[] {
  if (!rule) {
    return []
  }
  const matchingAlias = rule.type === 'ALIAS' && rule.named && rule.value === nodeType ? [rule] : []
  return [
    ...matchingAlias,
    ...findAliases(rule.content, nodeType),
    ...rule.members?.flatMap(member => findAliases(member, nodeType)) ?? [],
  ]
}

function union(values: readonly string[]): string {
  return [...new Set(values)].map(value => JSON.stringify(value)).join(' | ') || 'never'
}
