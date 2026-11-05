import { Errors, Range, Source } from '@shared'

/** SourceEdit replaces one UTF-16 source interval without retaining CST nodes. */
export type SourceEdit = { range: Range; text: string }

/** applyEdits applies ordered, nonoverlapping edits without changing their source snapshot. */
export function applyEdits(source: string, edits: readonly SourceEdit[]): string {
  const parts: string[] = []
  let offset = 0
  for (const edit of edits) {
    if (isInvalidEdit(edit, offset, source.length)) {
      Errors.ThrowShouldNeverHappen('Source edits overlap or leave their snapshot.')
    }
    parts.push(Source.slice(source, offset, edit.range.start), edit.text)
    offset = edit.range.end
  }
  parts.push(Source.slice(source, offset, source.length))
  return parts.join('')
}

function isInvalidEdit(edit: SourceEdit, offset: number, sourceLength: number): boolean {
  return edit.range.start < offset || edit.range.end < edit.range.start || edit.range.end > sourceLength
}
