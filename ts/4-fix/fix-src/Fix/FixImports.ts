import * as AST from '@ast-gen'
import * as CST from '@cst'

import * as Shared from '@shared'
import { collectStatementSlices, type StatementSlice } from '../lib/fixer/StatementSlices'
import type { SourceEdit } from '../Source'

/** organizeImports collects imports while keeping aliases, comments and unresolved names intact. */
export function organizeImports(source: string, tree: CST.Tree, ast: AST.Document): SourceEdit[] {
  const imports = AST.GetImportStatements(ast)
  if (imports.length === 0) {
    return []
  }
  const byStart = new Map(imports.map(statement => [statement.range.start, statement]))
  const slices = collectStatementSlices(source, tree)
  const imported = slices.filter(slice => byStart.has(slice.node.startIndex))
  const remaining = slices.filter(slice => !byStart.has(slice.node.startIndex))
  const newline = source.includes(Shared.CarriageReturnCharacter + Shared.NewlineCharacter)
    ? Shared.CarriageReturnCharacter + Shared.NewlineCharacter
    : Shared.NewlineCharacter
  const importText = groupImports(source, imported, byStart, newline).join(newline)
  const body = remaining.map(slice => Shared.Source.slice(source, slice)).join(newline.repeat(2))
  const text = importText + (body ? newline.repeat(2) + body : '')
  const start = slices[0]!.range.start
  const end = slices.at(-1)!.range.end
  return Shared.Source.slice(source, start, end) === text ? [] : [{ range: Shared.Range(start, end), text }]
}

type ImportNamesByFolder = Map<string, Set<string>>

function groupImports(
  source: string,
  slices: readonly StatementSlice[],
  imports: ReadonlyMap<number, AST.UseStatement>,
  newline: string,
): string[] {
  const output: string[] = []
  let groups: ImportNamesByFolder = new Map()
  const seenImports = new Set<string>()
  for (const slice of slices) {
    if (slice.commented) {
      output.push(...renderGroups(groups))
      groups = new Map()
      const statement = imports.get(slice.node.startIndex)!
      output.push(renderCommentedNamedImport(source, slice, statement, newline, seenImports))
    } else {
      addImport(groups, imports.get(slice.node.startIndex)!, seenImports)
    }
  }
  output.push(...renderGroups(groups))
  return output
}

function retainComments(source: string, slice: StatementSlice, newline: string, statementText = ''): string {
  const comments = collectCommentNodes(slice.node).map(node => Shared.Source.slice(source, node))
  const retained = [
    Shared.Source.slice(source, slice.range.start, slice.node.startIndex),
    ...comments,
    statementText,
    Shared.Source.slice(source, slice.node.endIndex, slice.range.end),
  ]
    .map(text => text.trim())
    .filter(Boolean)
    .join(newline)
  if (!retained) {
    return ''
  }
  if (statementText) {
    return retained
  }
  return newline + retained
}

function renderCommentedNamedImport(
  source: string,
  slice: StatementSlice,
  statement: AST.UseStatement,
  newline: string,
  seenImports: Set<string>,
): string {
  const newImports = collectNewNamedImports(statement, seenImports)
  if (newImports.length === statement.imports.length) {
    return Shared.Source.slice(source, slice)
  }
  return retainComments(source, slice, newline, renderNamedImport(statement, newImports))
}

function collectCommentNodes(node: StatementSlice['node']): StatementSlice['node'][] {
  return CST.IsComment(node)
    ? [node]
    : node.namedChildren.flatMap(collectCommentNodes)
}

function addImport(groups: ImportNamesByFolder, statement: AST.UseStatement, seenImports: Set<string>): void {
  const source = statement.from?.value ?? ''
  const names = groups.get(source) ?? new Set<string>()
  for (const imported of collectNewNamedImports(statement, seenImports)) {
    names.add(renderImportName(imported))
  }
  if (names.size > 0) {
    groups.set(source, names)
  }
}

function collectNewNamedImports(statement: AST.UseStatement, seenImports: Set<string>): AST.NamedImport[] {
  const source = statement.from?.value ?? ''
  const newImports: AST.NamedImport[] = []
  for (const imported of statement.imports) {
    const identity = createNamedImportIdentity(source, imported)
    if (seenImports.has(identity)) {
      continue
    }
    seenImports.add(identity)
    newImports.push(imported)
  }
  return newImports
}

function createNamedImportIdentity(source: string, imported: AST.NamedImport): string {
  const alias = imported.alias?.value ?? ''
  return `${source}:${imported.target.value}:${alias}`
}

function renderNamedImport(statement: AST.UseStatement, imports: readonly AST.NamedImport[]): string {
  if (imports.length === 0) {
    return ''
  }
  const names = imports.map(renderImportName)
  return renderImport(statement.from?.value ?? '', names)
}

function renderImportName(imported: AST.NamedImport): string {
  const alias = imported.alias
  return alias ? `${imported.target.value} as ${alias.value}` : imported.target.value
}

function renderImport(source: string, names: readonly string[]): string {
  return `use ${source ? `${source} ` : ''}${names.join(', ')}`
}

function renderGroups(groups: ImportNamesByFolder): string[] {
  return [...groups.keys()].sort(compareSources).map(source => {
    const names = [...groups.get(source)!].sort(Shared.Sort.CompareStrings)
    return renderImport(source, names)
  })
}

function compareSources(left: string, right: string): number {
  return rankSource(left) - rankSource(right) || Shared.Sort.CompareStrings(left, right)
}

function rankSource(source: string): number {
  if (source === '') {
    return 0
  }
  if (isExternalProjectAlias(source)) {
    return 1
  }
  return 2
}

function isExternalProjectAlias(source: string): boolean {
  return source.startsWith('@') || Shared.Regxs.PackageAliasPrefixRegx.test(source)
}
