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

/** TaoTextEscapeRegx matches an escape within a quoted Tao text fragment. */
export const TaoTextEscapeRegx = /\\(?:["{\\/bfnrt]|u[0-9a-fA-F]{4})/g
