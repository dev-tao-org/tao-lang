/** GrammarRule exposes the recursive Tree-sitter grammar shape used by generators. */
export type GrammarRule = { type: string; value?: string; content?: GrammarRule; members?: GrammarRule[] }

type OptionalGrammarRule = GrammarRule | undefined
/** collectOwnedTokens collects literal tokens recursively while stopping at referenced symbols. */
export function collectOwnedTokens(rule: OptionalGrammarRule): string[] {
  if (!rule || rule.type === 'SYMBOL') {
    return []
  }
  if (rule.type === 'STRING') {
    return [rule.value!]
  }
  return [...collectOwnedTokens(rule.content), ...rule.members?.flatMap(collectOwnedTokens) ?? []]
}
