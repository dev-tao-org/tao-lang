/** S trims blank boundary lines and common literal indentation, preserving relative indentation in substitutions. */
export function S(parts: TemplateStringsArray, ...values: unknown[]): string {
  const normalize = (value: string): string => value.replace(/\r\n?/g, '\n')
  const literals = parts.map(normalize)
  const indents = literals.join('x').split('\n').filter(line => line.trim()).map(line =>
    line.match(/^[\t ]*/)![0].length
  )
  const margin = indents.length ? Math.min(...indents) : 0
  let text = literals[0]
  for (let index = 0; index < values.length; index++) {
    const indent = text.slice(text.lastIndexOf('\n') + 1).match(/^[\t ]*/)![0]
    text += normalize(String(values[index])).replaceAll('\n', '\n' + indent) + literals[index + 1]
  }
  const lines = text.split('\n')
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) {
    start++
  }
  while (end > start && !lines[end - 1].trim()) {
    end--
  }
  return lines.slice(start, end).map(line => line.trim() ? line.slice(margin) : '').join('\n')
}
