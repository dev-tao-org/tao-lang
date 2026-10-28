/** GrammarRule exposes the recursive Tree-sitter grammar shape used by generators. */
export type GrammarRule = { type: string; value?: string; content?: GrammarRule; members?: GrammarRule[] }

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

type OptionalGrammarRule = GrammarRule | undefined
