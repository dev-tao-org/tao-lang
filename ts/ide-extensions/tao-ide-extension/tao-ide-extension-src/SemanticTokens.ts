import { type Token, uniqueTokens } from './QueryResults'

/** semanticTokenRanges splits enclosing captures around more specific nested captures.
 *  The resulting source-ordered ranges never overlap and can be encoded by the editor. */
export function semanticTokenRanges(tokens: readonly Token[]): Token[] {
  const events = uniqueTokens([...tokens]).flatMap(token => [
    { offset: token.start, token, entering: true },
    { offset: token.end, token, entering: false },
  ]).sort((left, right) => left.offset - right.offset)
  const active = new Set<Token>()
  const result: Token[] = []
  let cursor = 0
  let selected: Token | undefined
  for (const event of events) {
    if (selected && event.offset > cursor) {
      appendRange(result, cursor, event.offset, selected.kind)
    }
    cursor = event.offset
    if (event.entering) {
      active.add(event.token)
    } else {
      active.delete(event.token)
    }
    selected = innermost(active)
  }
  return result
}

function innermost(active: Set<Token>): Token | undefined {
  let selected: Token | undefined
  for (const token of active) {
    if (!selected || token.end - token.start < selected.end - selected.start) {
      selected = token
    }
  }
  return selected
}

function appendRange(ranges: Token[], start: number, end: number, kind: string): void {
  const previous = ranges.at(-1)
  if (previous?.end === start && previous.kind === kind) {
    previous.end = end
  } else {
    ranges.push({ start, end, kind })
  }
}
