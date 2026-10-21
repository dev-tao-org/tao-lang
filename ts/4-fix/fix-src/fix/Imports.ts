import * as AST from '@ast-gen/AST'
import * as CST from '@cst'
import type { Tree } from '@cst'
import { type StatementSlice, statementSlices } from '../lib/fixer/StatementSlices'
import type { SourceEdit } from '../Source'

/** organizeImports collects imports while keeping aliases, comments and unresolved names intact. */
export function organizeImports(source: string, tree: Tree, ast: AST.Document): SourceEdit[] {
  const imports = ast.root.declarations.filter(isImport)
  if (imports.length === 0) {
    return []
  }
  const byStart = new Map(imports.map(statement => [statement.start, statement]))
  const slices = statementSlices(source, tree)
  const imported = slices.filter(slice => byStart.has(slice.node.startIndex))
  const remaining = slices.filter(slice => !byStart.has(slice.node.startIndex))
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const importText = importGroups(source, imported, byStart, newline).join(newline)
  const body = remaining.map(slice => source.slice(slice.start, slice.end)).join(newline.repeat(2))
  const text = importText + (body ? newline.repeat(2) + body : '')
  const start = slices[0]!.start
  const end = slices.at(-1)!.end
  return source.slice(start, end) === text ? [] : [{ start, end, text }]
}

type Import = AST.UseStatement | AST.UsePackageStatement
type Group = { source: string; form: string; names: Set<string>; text?: string }

function isImport(node: AST.Declaration): node is Import {
  return AST.IsUseStatement(node) || AST.IsUsePackageStatement(node)
}

function importGroups(
  source: string,
  slices: readonly StatementSlice[],
  imports: ReadonlyMap<number, Import>,
  newline: string,
): string[] {
  const output: string[] = []
  let groups = new Map<string, Group>()
  const seenImports = new Set<string>()
  for (const slice of slices) {
    if (slice.commented) {
      output.push(...renderGroups(groups))
      groups = new Map()
      const statement = imports.get(slice.node.startIndex)!
      const duplicate = isDuplicateImport(statement, seenImports)
      recordImports(statement, seenImports)
      output.push(
        duplicate
          ? retainedComments(source, slice, newline)
          : source.slice(slice.start, slice.end),
      )
    } else {
      addImport(groups, imports.get(slice.node.startIndex)!, seenImports)
    }
  }
  output.push(...renderGroups(groups))
  return output
}

function retainedComments(source: string, slice: StatementSlice, newline: string): string {
  const comments = commentNodes(slice.node).map(node => source.slice(node.startIndex, node.endIndex))
  const retained = [
    source.slice(slice.start, slice.node.startIndex),
    ...comments,
    source.slice(slice.node.endIndex, slice.end),
  ]
    .map(text => text.trim())
    .filter(Boolean)
    .join(newline)
  return retained ? newline + retained : ''
}

function commentNodes(node: StatementSlice['node']): StatementSlice['node'][] {
  return CST.IsComment(node)
    ? [node]
    : node.namedChildren.flatMap(commentNodes)
}

function addImport(groups: Map<string, Group>, statement: Import, seenImports: Set<string>): void {
  if (isDuplicateImport(statement, seenImports)) {
    return
  }
  recordImports(statement, seenImports)
  const source = statement.from?.value ?? ''
  if (AST.IsUsePackageStatement(statement)) {
    const text = `use package ${source}${statement.alias ? ` as ${statement.alias.value}` : ''}`
    groups.set(text, { source, form: 'package', names: new Set(), text })
    return
  }
  const form = statement.all ? 'all' : 'named'
  const key = `${form}:${source}`
  const group = groups.get(key) ?? { source, form, names: new Set<string>() }
  for (const imported of statement.imports) {
    const name = imported.target.value + (imported.alias ? ` as ${imported.alias.value}` : '')
    group.names.add(name)
  }
  if (statement.all || group.names.size > 0) {
    groups.set(key, group)
  }
}

function isDuplicateImport(statement: Import, seenImports: ReadonlySet<string>): boolean {
  return importIdentities(statement).every(identity => seenImports.has(identity))
}

function recordImports(statement: Import, seenImports: Set<string>): void {
  for (const identity of importIdentities(statement)) {
    seenImports.add(identity)
  }
}

function importIdentities(statement: Import): string[] {
  const source = statement.from?.value ?? ''
  if (AST.IsUsePackageStatement(statement)) {
    return [`package:${source}:${statement.alias?.value ?? ''}`]
  }
  if (statement.all) {
    return [`all:${source}`]
  }
  return statement.imports.map(imported => `named:${source}:${imported.target.value}:${imported.alias?.value ?? ''}`)
}

function renderGroups(groups: ReadonlyMap<string, Group>): string[] {
  return [...groups.values()].sort(compareGroups).map(group => {
    if (group.text) {
      return group.text
    }
    const names = group.form === 'all' ? 'all' : [...group.names].sort().join(', ')
    return `use ${names}${group.source ? ` from ${group.source}` : ''}`
  })
}

function compareGroups(left: Group, right: Group): number {
  return sourceRank(left.source) - sourceRank(right.source)
    || compareText(left.source, right.source) || compareText(left.form, right.form)
}

function sourceRank(source: string): number {
  return source === '' ? 0 : isExternalProjectAlias(source) ? 1 : 2
}

function isExternalProjectAlias(source: string): boolean {
  return source.startsWith('@') || /^[A-Za-z0-9_-]+@/.test(source)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
