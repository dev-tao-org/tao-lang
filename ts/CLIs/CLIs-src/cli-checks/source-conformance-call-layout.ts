import { Regxs } from '@shared'
import * as TypeScript from 'typescript'

/** getSingleLineCallChanges collapses fitting multiline simple calls and if headers. */
export function getSingleLineCallChanges(file: TypeScript.SourceFile): TypeScript.TextChange[] {
  const changes: TypeScript.TextChange[] = []
  const visit = (node: TypeScript.Node): void => {
    if (TypeScript.isIfStatement(node)) {
      const replacement = singleLineIfHeaderReplacement(node, file)
      if (replacement) {
        changes.push(replacement)
        visit(node.thenStatement)
        if (node.elseStatement) {
          visit(node.elseStatement)
        }
        return
      }
    }
    const isCall = TypeScript.isCallExpression(node)
    if (isCall) {
      const replacement = singleLineCallReplacement(node, file)
      if (replacement) {
        changes.push({
          span: { start: node.getStart(file), length: node.getEnd() - node.getStart(file) },
          newText: replacement,
        })
        return
      }
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return changes
}

function singleLineCallReplacement(node: TypeScript.CallExpression, file: TypeScript.SourceFile): string | undefined {
  if (!node.arguments.length || node.arguments.some(argument => !TypeScript.isIdentifier(argument))) {
    return
  }
  const callText = node.getText(file)
  if (containsComment(callText)) {
    return
  }
  const calleeText = compactMultilineCallee(node, file)
  if (calleeText === undefined) {
    return
  }
  const callPrefix = file.text.slice(node.getStart(file), node.arguments.pos)
  if (calleeText === node.expression.getText(file) && Regxs.NewlineCharacter.test(callPrefix)) {
    return
  }
  if (!isMultiline(node, file)) {
    return
  }
  const argumentsText = node.arguments.map(argument => argument.getText(file)).join(', ')
  const openParenthesis = node.getChildren(file).find(child => child.kind === TypeScript.SyntaxKind.OpenParenToken)
  if (!openParenthesis) {
    return
  }
  const calleeSuffix = file.text.slice(node.expression.end, openParenthesis.end)
  if (containsComment(calleeSuffix) || Regxs.NewlineCharacter.test(calleeSuffix)) {
    return
  }
  const replacement = calleeText + calleeSuffix + argumentsText + ')'
  return fitsOnOneLine(node, replacement, file) ? replacement : undefined
}

function containsComment(text: string): boolean {
  const scanner = TypeScript.createScanner(
    TypeScript.ScriptTarget.Latest,
    false,
    TypeScript.LanguageVariant.Standard,
    text,
  )
  let token = scanner.scan()
  while (token !== TypeScript.SyntaxKind.EndOfFileToken) {
    if (
      token === TypeScript.SyntaxKind.SingleLineCommentTrivia || token === TypeScript.SyntaxKind.MultiLineCommentTrivia
    ) {
      return true
    }
    token = scanner.scan()
  }
  return false
}

function compactMultilineCallee(node: TypeScript.CallExpression, file: TypeScript.SourceFile): string | undefined {
  const calleeText = node.expression.getText(file)
  const typeArgumentsText = node.typeArguments ? file.text.slice(node.expression.end, node.typeArguments.end) : ''
  if (Regxs.NewlineCharacter.test(typeArgumentsText) || !Regxs.NewlineCharacter.test(calleeText)) {
    return calleeText
  }
  return compactSimpleCallee(node.expression)
}

function compactSimpleCallee(node: TypeScript.Expression): string | undefined {
  if (TypeScript.isIdentifier(node)) {
    return node.text
  }
  if (!TypeScript.isPropertyAccessExpression(node)) {
    return
  }
  const receiver = compactSimpleCallee(node.expression)
  if (receiver === undefined) {
    return
  }
  const accessOperator = node.questionDotToken ? '?.' : '.'
  return receiver + accessOperator + node.name.text
}

function singleLineIfHeaderReplacement(
  node: TypeScript.IfStatement,
  file: TypeScript.SourceFile,
): TypeScript.TextChange | undefined {
  if (!TypeScript.isCallExpression(node.expression)) {
    return
  }
  let callReplacement = singleLineCallReplacement(node.expression, file)
  if (!callReplacement) {
    callReplacement = singleLineIfCallText(node.expression, file)
  }
  if (!callReplacement) {
    return
  }
  const children = node.getChildren(file)
  const openParenthesis = children.find(child => child.kind === TypeScript.SyntaxKind.OpenParenToken)
  const closeParenthesis = children.find(child => child.kind === TypeScript.SyntaxKind.CloseParenToken)
  if (!openParenthesis || !closeParenthesis) {
    return
  }
  const start = node.getStart(file)
  const end = closeParenthesis.end
  const headerText = file.text.slice(start, end)
  if (containsComment(headerText)) {
    return
  }
  const replacement = 'if (' + callReplacement + ')'
  if (!Regxs.NewlineCharacter.test(headerText) || !fitsRangeOnOneLine(start, end, replacement, file)) {
    return
  }
  return { span: { start, length: end - start }, newText: replacement }
}

function singleLineIfCallText(node: TypeScript.CallExpression, file: TypeScript.SourceFile): string | undefined {
  const hasSimpleArguments = node.arguments.length > 0 && node.arguments.every(TypeScript.isIdentifier)
  const typeArgumentsText = node.typeArguments ? file.text.slice(node.expression.end, node.typeArguments.end) : ''
  if (!hasSimpleArguments || isMultiline(node, file)) {
    return
  }
  if (compactSimpleCallee(node.expression) === undefined || Regxs.NewlineCharacter.test(typeArgumentsText)) {
    return
  }
  if (containsComment(node.getText(file))) {
    return
  }
  return node.getText(file)
}

function isMultiline(node: TypeScript.CallExpression, file: TypeScript.SourceFile): boolean {
  const firstLine = file.getLineAndCharacterOfPosition(node.getStart(file)).line
  const lastLine = file.getLineAndCharacterOfPosition(node.getEnd() - 1).line
  return firstLine !== lastLine
}

function fitsOnOneLine(node: TypeScript.CallExpression, replacement: string, file: TypeScript.SourceFile): boolean {
  const start = node.getStart(file)
  const end = node.getEnd()
  return fitsRangeOnOneLine(start, end, replacement, file)
}

const MaximumCallLineWidth = 120
function fitsRangeOnOneLine(start: number, end: number, replacement: string, file: TypeScript.SourceFile): boolean {
  const startLineStart = file.getLineStarts()[file.getLineAndCharacterOfPosition(start).line]
  const lineEnd = file.text.indexOf('\n', end)
  const endLineEnd = lineEnd < 0 ? file.text.length : lineEnd
  const prefix = file.text.slice(startLineStart, start)
  const suffix = file.text.slice(end, endLineEnd)
  const suffixWithoutCarriageReturn = suffix.endsWith('\r') ? suffix.slice(0, -1) : suffix
  return prefix.length + replacement.length + suffixWithoutCarriageReturn.length <= MaximumCallLineWidth
}
