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

type Import = AST.UseStatement | AST.UsePackageStatement
type Group = { source: string; form: string; names: Set<string>; text?: string }

function groupImports(
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
      if (AST.IsUseStatement(statement) && !statement.all) {
        output.push(renderCommentedNamedImport(source, slice, statement, newline, seenImports))
      } else {
        const duplicate = isDuplicateImport(statement, seenImports)
        recordImports(statement, seenImports)
        output.push(duplicate ? retainComments(source, slice, newline) : Shared.Source.slice(source, slice))
      }
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

function addImport(groups: Map<string, Group>, statement: Import, seenImports: Set<string>): void {
  const source = statement.from?.value ?? ''
  if (AST.IsUsePackageStatement(statement)) {
    if (isDuplicateImport(statement, seenImports)) {
      return
    }
    recordImports(statement, seenImports)
    const text = `use package ${source}${statement.alias ? ` as ${statement.alias.value}` : ''}`
    groups.set(text, { source, form: 'package', names: new Set(), text })
    return
  }
  if (statement.all) {
    if (isDuplicateImport(statement, seenImports)) {
      return
    }
    recordImports(statement, seenImports)
  }
  const form = statement.all ? 'all' : 'named'
  const key = `${form}:${source}`
  const group = groups.get(key) ?? { source, form, names: new Set<string>() }
  const newImports = collectNewNamedImports(statement, seenImports)
  for (const imported of newImports) {
    const name = imported.target.value + (imported.alias ? ` as ${imported.alias.value}` : '')
    group.names.add(name)
  }
  if (statement.all || group.names.size > 0) {
    groups.set(key, group)
  }
}

function isDuplicateImport(statement: Import, seenImports: ReadonlySet<string>): boolean {
  return collectImportIdentities(statement).every(identity => seenImports.has(identity))
}

function recordImports(statement: Import, seenImports: Set<string>): void {
  for (const identity of collectImportIdentities(statement)) {
    seenImports.add(identity)
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
  return `named:${source}:${imported.target.value}:${alias}`
}

function renderNamedImport(statement: AST.UseStatement, imports: readonly AST.NamedImport[]): string {
  if (imports.length === 0) {
    return ''
  }
  const names = imports.map(imported =>
    `${imported.target.value}${imported.alias ? ` as ${imported.alias.value}` : ''}`
  ).join(', ')
  const source = statement.from?.value ?? ''
  return `use ${source ? `${source} ` : ''}${names}`
}

function collectImportIdentities(statement: Import): string[] {
  const source = statement.from?.value ?? ''
  if (AST.IsUsePackageStatement(statement)) {
    return [`package:${source}:${statement.alias?.value ?? ''}`]
  }
  if (statement.all) {
    return [`all:${source}`]
  }
  return statement.imports.map(imported => createNamedImportIdentity(source, imported))
}

function renderGroups(groups: ReadonlyMap<string, Group>): string[] {
  return [...groups.values()].sort(compareGroups).map(group => {
    if (group.text) {
      return group.text
    }
    const namesCode = group.form === 'all' ? 'all' : [...group.names].sort(Shared.Sort.CompareStrings).join(', ')
    return `use ${group.source ? `${group.source} ` : ''}${namesCode}`
  })
}

function compareGroups(left: Group, right: Group): number {
  return rankSource(left.source) - rankSource(right.source)
    || Shared.Sort.CompareStrings(left.source, right.source)
    || Shared.Sort.CompareStrings(left.form, right.form)
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
