import { Json } from '@shared'
import { Lists, S } from '@shared'
import * as Shared from '@shared'
import { FS, Path } from '@shared/os'
import * as GrammarTraversal from './grammar-traversal'

/** writeCSTTypes derives field names and directly owned tokens from the generated grammar. */
export async function writeCSTTypes(directory: string): Promise<void> {
  const grammar = await readCstGrammar(Path.join(directory, 'src/grammar.json'))
  const nodes = await readCstNodes(Path.join(directory, 'src/node-types.json'))
  const members = nodes.filter(node => node.named).map(node => {
    const fields = union(Object.keys(node.fields ?? {}))
    const directTokens = GrammarTraversal.collectOwnedTokens(grammar.rules[node.type])
    const aliasedTokensForNode = aliasedTokens(grammar.rules, node.type)
    const tokens = union([...directTokens, ...aliasedTokensForNode])
    return `  ${emitCstStringLiteral(node.type)}: { fields: ${fields}; tokens: ${tokens} }`
  })
  const source = S`
    // @generated from Tree-sitter node-types.json and grammar.json.
    export interface NodeTypes {
    ${Shared.joinTextLines(...members)}
    }
  `
  await FS.writeIfChanged(Path.join(directory, 'CST.ts'), Shared.joinTextLines(source, ''))
}

type Rule = GrammarTraversal.GrammarRule & { name?: string; named?: boolean; content?: Rule; members?: Rule[] }
type CstGrammar = { rules: Record<string, Rule> }
type CstNode = { type: string; named: boolean; fields?: Record<string, unknown> }

async function readCstGrammar(path: string): Promise<CstGrammar> {
  return Json.Parse(await FS.readFile(path, 'utf8')) as CstGrammar
}

async function readCstNodes(path: string): Promise<CstNode[]> {
  return Json.Parse(await FS.readFile(path, 'utf8')) as CstNode[]
}

function aliasedTokens(rules: Record<string, Rule>, nodeType: string): string[] {
  return Object.values(rules).flatMap(rule =>
    findAliases(rule, nodeType).flatMap(alias => {
      const content = alias.content
      const source = content?.type === 'SYMBOL' ? rules[content.name!] : content
      return GrammarTraversal.collectOwnedTokens(source)
    })
  )
}

type OptionalRule = Rule | undefined

function findAliases(rule: OptionalRule, nodeType: string): Rule[] {
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
  return Lists.unique(values).map(emitCstStringLiteral).join(' | ') || 'never'
}

function emitCstStringLiteral(value: string): string {
  return Json.Print(value)
}
