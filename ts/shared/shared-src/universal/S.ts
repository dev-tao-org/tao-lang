import { NewlineCharacter } from './Characters'
import * as TextRegxs from './Regxs/TextRegxs'

/** S trims blank boundary lines and common literal indentation, preserving relative indentation in substitutions. */
export function S(parts: TemplateStringsArray, ...values: unknown[]): string {
  const CarriageReturnLineEndingsRegx = TextRegxs.createCarriageReturnLineEndingsRegx()
  const normalize = (value: string): string => value.replace(CarriageReturnLineEndingsRegx, NewlineCharacter)
  const literals = parts.map(normalize)
  const indents = literals.join('x').split(NewlineCharacter).filter(line => line.trim()).map(line =>
    line.match(TextRegxs.LeadingHorizontalWhitespaceRegx)![0].length
  )
  const margin = indents.length ? Math.min(...indents) : 0
  let text = literals[0]
  for (let index = 0; index < values.length; index++) {
    const indent =
      text.slice(text.lastIndexOf(NewlineCharacter) + 1).match(TextRegxs.LeadingHorizontalWhitespaceRegx)![0]
    text += normalize(String(values[index])).replaceAll(NewlineCharacter, NewlineCharacter + indent)
      + literals[index + 1]
  }
  const lines = text.split(NewlineCharacter)
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) {
    start++
  }
  while (end > start && !lines[end - 1].trim()) {
    end--
  }
  return lines.slice(start, end).map(line => line.trim() ? line.slice(margin) : '').join(NewlineCharacter)
}

type TextLine = string | null | undefined

/** joinTextLines joins line values without normalizing or trimming their contents. */
export function joinTextLines(...parts: readonly TextLine[]): string {
  return parts.join(NewlineCharacter)
}
