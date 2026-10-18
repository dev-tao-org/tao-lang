import { Errors } from '@shared'

/** SourceRange identifies a UTF-16 interval in one immutable source snapshot. */
export type SourceRange = { start: number; end: number }

/** SourceEdit replaces one source interval without retaining CST nodes. */
export type SourceEdit = SourceRange & { text: string }

/** applyEdits applies ordered, nonoverlapping edits without changing their source snapshot. */
export function applyEdits(source: string, edits: readonly SourceEdit[]): string {
  const parts: string[] = []
  let offset = 0
  for (const edit of edits) {
    if (edit.start < offset || edit.end < edit.start || edit.end > source.length) {
      Errors.ThrowUnexpected('Source edits overlap or leave their snapshot.')
    }
    parts.push(source.slice(offset, edit.start), edit.text)
    offset = edit.end
  }
  parts.push(source.slice(offset))
  return parts.join('')
}
