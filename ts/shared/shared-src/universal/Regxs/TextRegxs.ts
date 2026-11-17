/** WhitespaceRunsRegx matches one or more whitespace characters. */
export const WhitespaceRunsRegx = /\s+/

/** createCarriageReturnLineEndingsRegx creates a fresh global line-ending matcher. */
export function createCarriageReturnLineEndingsRegx(): RegExp {
  const CarriageReturnLineEndingsRegx = /\r\n?/g
  return CarriageReturnLineEndingsRegx
}

/** LeadingHorizontalWhitespaceRegx matches horizontal whitespace at a line start. */
export const LeadingHorizontalWhitespaceRegx = /^[\t ]*/

/** NewlineCharacterGlobalRegx matches each LF used to count source lines. */
export const NewlineCharacterGlobalRegx = /\n/g

/** WhitespaceOnlyRegx matches text containing only whitespace. */
export const WhitespaceOnlyRegx = /^\s*$/

/** LeadingInlineTaoTriviaRegx matches horizontal spaces and complete single-line block comments. */
export const LeadingInlineTaoTriviaRegx = /^(?:[\t ]|\/\*[^\r\n]*?\*\/)+/

/** LeadingTaoLetBindingRegx recognizes a let binding or its typed prefix at a statement boundary. */
export const LeadingTaoLetBindingRegx = /^(?:(?:file|folder|package)[\t ]+)?let[\t ]+[A-Za-z_]\w*[\t ]*(?:=|is\b)/
