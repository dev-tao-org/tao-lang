/** WhitespaceRunsRegx matches one or more whitespace characters. */
export const WhitespaceRunsRegx = /\s+/

/** SpacesRegx splits a command on runs of ASCII spaces. */
export const SpacesRegx = / +/

/** createCarriageReturnLineEndingsRegx creates a fresh global line-ending matcher. */
export function createCarriageReturnLineEndingsRegx(): RegExp {
  const CarriageReturnLineEndingsRegx = /\r\n?/g
  return CarriageReturnLineEndingsRegx
}

/** LeadingHorizontalWhitespaceRegx matches horizontal whitespace at a line start. */
export const LeadingHorizontalWhitespaceRegx = /^[\t ]*/

/** BlockTypeSuffixRegx matches the Block suffix of generated CST constructor names. */
export const BlockTypeSuffixRegx = /Block$/

/** LowercaseUppercaseBoundaryRegx matches a lowercase-to-uppercase name boundary. */
export const LowercaseUppercaseBoundaryRegx = /([a-z])([A-Z])/g

/** NewlineCharacterGlobalRegx matches each LF used to count source lines. */
export const NewlineCharacterGlobalRegx = /\n/g

/** WhitespaceOnlyRegx matches text containing only whitespace. */
export const WhitespaceOnlyRegx = /^\s*$/
