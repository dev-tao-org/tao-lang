import { Source } from '@shared'
import { Edit, type Tree } from 'web-tree-sitter'

/** editTreeForSource applies the smallest safe UTF-16 edit to an old syntax tree. */
export function editTreeForSource(tree: Tree, previousSource: string, nextSource: string): void {
  const startIndex = commonPrefix(previousSource, nextSource)
  const oldEndIndex = commonSuffixStart(previousSource, nextSource, startIndex)
  const newEndIndex = nextSource.length - (previousSource.length - oldEndIndex)
  tree.edit(
    new Edit({
      startIndex,
      oldEndIndex,
      newEndIndex,
      startPosition: pointAt(previousSource, startIndex),
      oldEndPosition: pointAt(previousSource, oldEndIndex),
      newEndPosition: pointAt(nextSource, newEndIndex),
    }),
  )
}

function commonPrefix(left: string, right: string): number {
  let index = 0
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index++
  }
  if (index > 0 && isHighSurrogate(left.charCodeAt(index - 1))) {
    index--
  }
  return index
}

function commonSuffixStart(left: string, right: string, prefix: number): number {
  let leftIndex = left.length
  let rightIndex = right.length
  while (leftIndex > prefix && rightIndex > prefix && left[leftIndex - 1] === right[rightIndex - 1]) {
    leftIndex--
    rightIndex--
  }
  if (leftIndex < left.length && isLowSurrogate(left.charCodeAt(leftIndex))) {
    leftIndex++
  }
  return leftIndex
}

function pointAt(source: string, index: number): { row: number; column: number } {
  const position = Source.positionAt(source, index)
  return { row: position.line, column: position.column }
}

const HighSurrogateStart = 0xd800
const HighSurrogateEnd = 0xdbff

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= HighSurrogateStart && codeUnit <= HighSurrogateEnd
}

const LowSurrogateStart = 0xdc00
const LowSurrogateEnd = 0xdfff

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= LowSurrogateStart && codeUnit <= LowSurrogateEnd
}
