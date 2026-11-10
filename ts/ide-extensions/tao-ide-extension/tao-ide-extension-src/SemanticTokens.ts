import { Range } from '@shared'
import { type Token, uniqueTokens } from './QueryResults'

/** semanticTokenRanges splits enclosing captures around more specific nested captures.
 *  The resulting source-ordered ranges never overlap and can be encoded by the editor. */
export function semanticTokenRanges(tokens: readonly Token[]): Token[] {
  const events = uniqueTokens([...tokens]).flatMap(token => [
    { offset: token.range.start, token, entering: true },
    { offset: token.range.end, token, entering: false },
  ]).sort((left, right) => left.offset - right.offset)
  const active = new Set<Token>()
  const result: Token[] = []
  let cursor = 0
  let selected: OptionalToken
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
  let selected: OptionalToken
  for (const token of active) {
    if (!selected || token.range.end - token.range.start < selected.range.end - selected.range.start) {
      selected = token
    }
  }
  return selected
}

type OptionalToken = Token | undefined

function appendRange(ranges: Token[], start: number, end: number, kind: string): void {
  const previous = ranges.at(-1)
  if (previous && isAdjacentTokenOfKind(previous, start, kind)) {
    previous.range.end = end
  } else {
    ranges.push({ range: Range(start, end), kind })
  }
}

function isAdjacentTokenOfKind(previous: Token, start: number, kind: string): boolean {
  return previous.range.end === start && previous.kind === kind
}
