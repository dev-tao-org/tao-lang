import { CarriageReturnCharacter, NewlineCharacter, Range, Regxs, Try } from '@shared'
import { type Node, type Tree } from './Bridge_web-tree-sitter'
import { collectDiagnostics, type Diagnostic } from './QueryResults'

type ParseRepair = (source: string) => Tree | null

/** refineInlinePressDiagnostics diagnoses incomplete handler prefixes against the recovered Tao tree. */
export function refineInlinePressDiagnostics(
  root: Node,
  source: string,
  diagnostics: Diagnostic[],
  parseRepair: ParseRepair,
): Diagnostic[] {
  if (diagnostics.length === 0) {
    return diagnostics
  }
  const issues: PressIssue[] = []
  collectPressIssues(root, source, diagnostics, issues)
  const remaining = diagnostics.filter(diagnostic => !issues.some(issue => ownsDiagnostic(issue, diagnostic)))
  const issue = issues[0]
  const confirmed = issues.length === 1 && issue && remaining.length > 0
    ? probeRecovery(source, issue, parseRepair)
    : undefined
  return (confirmed ?? remaining).concat(issues.map(issue => issue.diagnostic))
}

type PressIssue = {
  scope: Range
  diagnostic: Diagnostic
  repair: { start: number; end: number; text: string }
}
type Prefix = { start: number; end: number; text: string }

const Arrow = '->'
const ExpectedBody = 'Expected a `do` call, a `set` statement, or a `{ … }` block after `->`.'

function collectPressIssues(node: Node, source: string, diagnostics: Diagnostic[], issues: PressIssue[]): void {
  const arrow = findPressArrow(node)
  if (arrow) {
    const issue = classifyPressIssue(node, arrow, source, diagnostics)
    if (issue) {
      issues.push(issue)
    }
  }
  if (node.hasError) {
    for (const child of node.namedChildren) {
      if (child.hasError || child.type === 'PressBinding') {
        collectPressIssues(child, source, diagnostics, issues)
      }
    }
  }
}

function findPressArrow(node: Node): Node | undefined {
  if (node.type !== 'PressBinding' && node.type !== 'ERROR') {
    return undefined
  }
  const children = node.children.filter(child => child.type !== 'Comment')
  if (children[0]?.type !== 'on' || children[1]?.type !== 'press') {
    return undefined
  }
  const handler = children[2]
  if (handler?.type === Arrow) {
    return handler
  }
  return handler?.children.find(child => child.type === Arrow)
}

function classifyPressIssue(
  binding: Node,
  arrow: Node,
  source: string,
  diagnostics: Diagnostic[],
): PressIssue | undefined {
  const line = readLine(source, arrow.endIndex)
  if (line.length === MaxPrefixLength) {
    return undefined
  }
  const command = readToken(line, arrow.endIndex)
  const issue = classifyPrefix(binding.startIndex, arrow, command, line)
  if (!issue || arrow.isMissing) {
    return undefined
  }
  if (!binding.hasError && !hasDisplacedBinding(binding, source, diagnostics)) {
    return undefined
  }
  if (hasOpenedBody(binding, arrow, command)) {
    return undefined
  }
  return issue
}

function hasOpenedBody(binding: Node, arrow: Node, command: Prefix): boolean {
  const body = binding.childForFieldName('handler')?.childForFieldName('body')
  if (!command.text && body?.type === 'Block') {
    return true
  }
  if (body?.type !== 'DoStatement' || command.text !== 'do') {
    return false
  }
  const target = body.childForFieldName('target')
  const opener = body.childForFieldName('argumentList')?.child(0)
  return target?.startPosition.row === arrow.startPosition.row && opener?.type === '(' && !opener.isMissing
}

const MaxPrefixLength = 1024

function readLine(source: string, start: number): string {
  const nearby = source.slice(start, start + MaxPrefixLength)
  const lf = nearby.indexOf(NewlineCharacter)
  const cr = nearby.indexOf(CarriageReturnCharacter)
  const end = Math.min(lf < 0 ? nearby.length : lf, cr < 0 ? nearby.length : cr)
  return nearby.slice(0, end)
}

function hasDisplacedBinding(binding: Node, source: string, diagnostics: Diagnostic[]): boolean {
  const handler = binding.childForFieldName('handler')
  const body = handler?.childForFieldName('body')
  const value = body?.childForFieldName('value')
  if (value?.text !== 'let') {
    return false
  }
  const statement = readLine(source, value.startIndex)
  const nextStatementEnd = value.startIndex + statement.length
  return Regxs.LeadingTaoLetBindingRegx.test(statement)
    && diagnostics.some(({ range }) => range.start >= value.endIndex && range.start <= nextStatementEnd)
}

function classifyPrefix(start: number, arrow: Node, command: Prefix, line: string): PressIssue | undefined {
  const afterCommand = line.slice(command.end - arrow.endIndex)
  const target = readToken(afterCommand, command.end)
  if (command.text === '{') {
    return undefined
  }
  if (command.text === 'do') {
    return classifyDo(start, command, target, afterCommand)
  }
  if (command.text === 'set') {
    return classifySet(start, command, target, afterCommand)
  }
  if (!command.text) {
    return pressIssue(start, arrow.endIndex, Range(arrow.startIndex, arrow.endIndex), ExpectedBody, ' do Recovery()')
  }
  return pressIssue(start, command.end, Range(command.start, command.end), ExpectedBody, 'do Recovery()', command.start)
}

function classifyDo(start: number, command: Prefix, target: Prefix, tail: string): PressIssue | undefined {
  if (target.text === '{') {
    const message = 'Start a block with `-> {`. Use `do` to call an action.'
    return pressIssue(start, target.end, Range(command.start, command.end), message, 'do Recovery()', command.start)
  }
  if (!target.text) {
    return insertAt(start, command.end, 'Expected an action name after `do`.', ' Recovery()')
  }
  if (!Regxs.LeadingTaoQualifiedNameRegx.test(target.text)) {
    return undefined
  }
  const argument = readToken(tail.slice(target.end - command.end), target.end)
  if (!argument.text) {
    const message = 'Expected an argument list in parentheses after the action name.'
    return insertAt(start, target.end, message, '()')
  }
  return undefined
}

function classifySet(start: number, command: Prefix, target: Prefix, tail: string): PressIssue | undefined {
  if (!target.text) {
    return insertAt(start, command.end, 'Expected a state name after `set`.', ' Recovery = ""')
  }
  if (!Regxs.LeadingTaoQualifiedNameRegx.test(target.text)) {
    return undefined
  }
  const equals = readToken(tail.slice(target.end - command.end), target.end)
  if (!equals.text) {
    return insertAt(start, target.end, 'Expected `=` after the state name.', ' = ""')
  }
  const value = readToken(tail.slice(equals.end - command.end), equals.end)
  if (equals.text === '=' && !value.text) {
    return insertAt(start, equals.end, 'Expected a value after `=`.', ' ""')
  }
  return undefined
}

function readToken(tail: string, offset: number): Prefix {
  const trivia = Regxs.LeadingInlineTaoTriviaRegx.exec(tail)?.[0] ?? ''
  const text = tail.slice(trivia.length)
  const start = offset + trivia.length
  const token = isStatementBoundary(text) ? '' : Regxs.LeadingTaoQualifiedNameRegx.exec(text)?.[0] ?? text.slice(0, 1)
  return { start, end: start + token.length, text: token }
}

function isStatementBoundary(text: string): boolean {
  if (text.startsWith('}') || text.startsWith('#')) {
    return true
  }
  return text.startsWith('//') || text.startsWith('/*') || Regxs.LeadingTaoLetBindingRegx.test(text)
}

function insertAt(start: number, end: number, message: string, text: string): PressIssue {
  return pressIssue(start, end, Range(end, end), message, text)
}

function pressIssue(
  start: number,
  end: number,
  range: Range,
  message: string,
  text: string,
  replace = end,
): PressIssue {
  return { scope: Range(start, end), diagnostic: { range, message }, repair: { start: replace, end, text } }
}

function ownsDiagnostic(issue: PressIssue, { range }: Diagnostic): boolean {
  return range.start >= issue.scope.start && range.end <= issue.scope.end
}

function probeRecovery(source: string, issue: PressIssue, parseRepair: ParseRepair): Diagnostic[] | undefined {
  const { start, end, text } = issue.repair
  const repaired = parseRepair(source.slice(0, start) + text + source.slice(end))
  if (!repaired) {
    return undefined
  }
  return Try(() => {
    const repairEnd = start + text.length
    const delta = repairEnd - end
    const diagnostics = collectDiagnostics(repaired.rootNode)
    if (diagnostics.some(({ range }) => range.start < repairEnd && range.end > start)) {
      return undefined
    }
    return diagnostics.map(diagnostic => {
      if (diagnostic.range.start < repairEnd) {
        return diagnostic
      }
      const range = Range(diagnostic.range.start - delta, diagnostic.range.end - delta)
      return { ...diagnostic, range }
    })
  }, { finally: () => repaired.delete() })
}
