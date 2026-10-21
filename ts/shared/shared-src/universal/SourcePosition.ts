/** sourcePositionAt finds a zero-based UTF-16 line and column for a valid source offset. */
export function sourcePositionAt(source: string, offset: number): { line: number; column: number } {
  let line = 0
  let lineStart = 0
  for (let index = 0; index < offset; index++) {
    if (source.charCodeAt(index) === 10) {
      line++
      lineStart = index + 1
    }
  }
  return { line, column: offset - lineStart }
}
