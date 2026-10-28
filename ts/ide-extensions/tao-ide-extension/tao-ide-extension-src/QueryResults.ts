import { Range, Source, Time } from '@shared'
import { type Node, type Query } from 'web-tree-sitter'

/** Token is a syntax query capture mapped to an editor source range. */
export interface Token {
  range: Range
  kind: string
}

/** Diagnostic describes a parser error mapped to an editor source range. */
export interface Diagnostic {
  range: Range
  message: string
}

/** QueryMeasure records time spent collecting query matches. */
export type QueryMeasure = (milliseconds: number) => void

/** collectTokens runs a query and maps each capture into its source range. */
export function collectTokens(query: Query, node: Node, baseOffset = 0, measure?: QueryMeasure): Token[] {
  return measureQuery(() =>
    query.matches(node).flatMap(match =>
      match.captures.flatMap(capture => {
        const kind = tokenKind(capture.name)
        return kind
          ? [{
            range: Range(baseOffset + capture.node.startIndex, baseOffset + capture.node.endIndex),
            kind,
          }]
          : []
      })
    ), measure)
}

/** collectDiagnostics returns ERROR and missing nodes as source diagnostics. */
export function collectDiagnostics(root: Node, baseOffset = 0): Diagnostic[] {
  return findNodes(root, 'ERROR').map(node => ({
    range: Range(baseOffset + node.startIndex, baseOffset + Math.max(node.endIndex, node.startIndex + 1)),
    message: 'Unexpected syntax',
  })).concat(
    findNodes(root, 'MISSING').map(node => ({
      range: Range(baseOffset + node.startIndex, baseOffset + node.startIndex),
      message: `Expected ${node.type}`,
    })),
  )
}

/** uniqueTokens removes duplicate captures and sorts ranges for the editor. */
export function uniqueTokens(tokens: Token[]): Token[] {
  const ranges = new Map<string, Token>()
  for (const token of tokens) {
    const key = `${token.range.start}:${token.range.end}`
    const existing = ranges.get(key)
    if (!existing || priority(token.kind) < priority(existing.kind)) {
      ranges.set(key, token)
    }
  }
  return [...ranges.values()].sort(Source.compareByRange)
}

/** uniqueDiagnostics removes duplicate diagnostics and sorts by source range. */
export function uniqueDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>()
  return diagnostics.filter(diagnostic => {
    const key = `${diagnostic.range.start}:${diagnostic.range.end}:${diagnostic.message}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  }).sort(Source.compareByRange)
}

/** findNodes recursively collects nodes with a type or missing-node flag. */
export function findNodes(root: Node, type: string): Node[] {
  const found: Node[] = []
  const visit = (node: Node) => {
    if (node.type === type || (type === 'MISSING' && node.isMissing)) {
      found.push(node)
    }
    for (const child of node.children) {
      visit(child)
    }
  }
  visit(root)
  return found
}

function measureQuery<T>(operation: () => T, measure?: QueryMeasure): T {
  if (!measure) {
    return operation()
  }
  const start = Time.nowMs()
  const result = operation()
  measure(Time.nowMs() - start)
  return result
}

const tokenKinds: Record<string, string> = {
  comment: 'comment',
  constant: 'variable',
  constructor: 'type',
  function: 'function',
  keyword: 'keyword',
  number: 'number',
  operator: 'operator',
  property: 'property',
  attribute: 'property',
  string: 'string',
  tag: 'type',
  type: 'type',
  variable: 'variable',
}

function tokenKind(capture: string): string | undefined {
  return tokenKinds[capture] ?? tokenKinds[capture.split('.')[0]]
}

function priority(kind: string): number {
  if (kind === 'variable') {
    return 2
  }
  if (kind === 'property') {
    return 1
  }
  return 0
}
