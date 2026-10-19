import * as AST from '@ast-gen/AST'
import type { Tree } from '@grammar/CST'
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
  const importText = importGroups(source, imported, byStart).join(newline)
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
): string[] {
  const output: string[] = []
  let groups = new Map<string, Group>()
  for (const slice of slices) {
    if (slice.commented) {
      output.push(...renderGroups(groups), source.slice(slice.start, slice.end))
      groups = new Map()
    } else {
      addImport(groups, imports.get(slice.node.startIndex)!)
    }
  }
  output.push(...renderGroups(groups))
  return output
}

function addImport(groups: Map<string, Group>, statement: Import): void {
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
    group.names.add(imported.target.value + (imported.alias ? ` as ${imported.alias.value}` : ''))
  }
  groups.set(key, group)
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
