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
