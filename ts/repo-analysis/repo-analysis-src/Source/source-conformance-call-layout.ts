import { CarriageReturnCharacter, NewlineCharacter, Regxs } from '@shared'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

/** getSingleLineCallChanges collapses fitting calls, single-parameter lists and if headers. */
export function getSingleLineCallChanges(file: TypeScript.SourceFile): TypeScript.TextChange[] {
  const changes: TypeScript.TextChange[] = []
  const visit = (node: TypeScript.Node): void => {
    const parameterChange = singleParameterChange(node, file)
    if (parameterChange) {
      changes.push(parameterChange)
    }
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
    const isCall = TypeScript.isCallExpression(node) || TypeScript.isNewExpression(node)
    if (isCall) {
      const replacement = singleLineCallReplacement(node, file)
      if (replacement && replacement !== node.getText(file)) {
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

type Invocation = TypeScript.CallExpression | TypeScript.NewExpression

function singleLineCallReplacement(node: Invocation, file: TypeScript.SourceFile): string | undefined {
  const args = node.arguments
  if (!args || !hasCompactArguments(args, file)) {
    return
  }
  if (containsComment(node, file, node.getStart(file), node.end)) {
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
  const argumentsText = args.map(argument => argument.getText(file)).join(', ')
  const openParenthesis = node.getChildren(file).find(child => child.kind === TypeScript.SyntaxKind.OpenParenToken)
  if (!openParenthesis) {
    return
  }
  const calleeSuffix = file.text.slice(node.expression.end, openParenthesis.end)
  if (Regxs.NewlineCharacter.test(calleeSuffix)) {
    return
  }
  const invocationPrefix = TypeScript.isNewExpression(node) ? 'new ' : ''
  const replacement = invocationPrefix + calleeText + calleeSuffix + argumentsText + ')'
  return fitsOnOneLine(node, replacement, file) ? replacement : undefined
}

function hasCompactArguments(args: readonly TypeScript.Expression[], file: TypeScript.SourceFile): boolean {
  if (args.length === 1) {
    return !Regxs.NewlineCharacter.test(args[0]!.getText(file))
  }
  return args.length > 0 && args.every(TypeScript.isIdentifier)
}

function singleParameterChange(node: TypeScript.Node, file: TypeScript.SourceFile): TypeScript.TextChange | undefined {
  if (!TypeScript.isFunctionLike(node) || node.parameters.length !== 1) {
    return
  }
  const parameterText = node.parameters[0]!.getText(file)
  if (Regxs.NewlineCharacter.test(parameterText)) {
    return
  }
  const children = node.getChildren(file)
  const openParenthesis = children.find(child => child.kind === TypeScript.SyntaxKind.OpenParenToken)
  const closeParenthesis = children.find(child => child.kind === TypeScript.SyntaxKind.CloseParenToken)
  if (!openParenthesis || !closeParenthesis) {
    return
  }
  const start = openParenthesis.getStart(file)
  const end = closeParenthesis.end
  const listText = file.text.slice(start, end)
  const replacement = '(' + parameterText + ')'
  if (!Regxs.NewlineCharacter.test(listText) || containsComment(node, file, start, end)) {
    return
  }
  if (!fitsRangeOnOneLine(start, end, replacement, file)) {
    return
  }
  return { span: { start, length: end - start }, newText: replacement }
}

function containsComment(node: TypeScript.Node, file: TypeScript.SourceFile, start: number, end: number): boolean {
  const fullStart = node.getFullStart()
  if (fullStart >= end || node.end < start) {
    return false
  }
  // Parser token boundaries distinguish regex and template contents from trivia.
  const withinRange = (comment: TypeScript.CommentRange) => comment.pos >= start && comment.end <= end
  const leading = TypeScript.getLeadingCommentRanges(file.text, fullStart) ?? []
  const trailing = TypeScript.getTrailingCommentRanges(file.text, node.end) ?? []
  const sameLine = TypeScript.getTrailingCommentRanges(file.text, fullStart) ?? []
  const hasComment = [...leading, ...trailing, ...sameLine].some(withinRange)
  return hasComment || node.getChildren(file).some(child => containsComment(child, file, start, end))
}

function compactMultilineCallee(node: Invocation, file: TypeScript.SourceFile): string | undefined {
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
  if (containsComment(node, file, start, end)) {
    return
  }
  const replacement = 'if (' + callReplacement + ')'
  if (!Regxs.NewlineCharacter.test(headerText) || !fitsRangeOnOneLine(start, end, replacement, file)) {
    return
  }
  return { span: { start, length: end - start }, newText: replacement }
}

function singleLineIfCallText(node: TypeScript.CallExpression, file: TypeScript.SourceFile): string | undefined {
  const hasSimpleArguments = hasCompactArguments(node.arguments, file)
  const typeArgumentsText = node.typeArguments ? file.text.slice(node.expression.end, node.typeArguments.end) : ''
  if (!hasSimpleArguments || isMultiline(node, file)) {
    return
  }
  if (compactSimpleCallee(node.expression) === undefined || Regxs.NewlineCharacter.test(typeArgumentsText)) {
    return
  }
  if (containsComment(node, file, node.getStart(file), node.end)) {
    return
  }
  return node.getText(file)
}

function isMultiline(node: TypeScript.Node, file: TypeScript.SourceFile): boolean {
  const firstLine = file.getLineAndCharacterOfPosition(node.getStart(file)).line
  const lastLine = file.getLineAndCharacterOfPosition(node.getEnd() - 1).line
  return firstLine !== lastLine
}

function fitsOnOneLine(node: Invocation, replacement: string, file: TypeScript.SourceFile): boolean {
  const start = node.getStart(file)
  const end = node.getEnd()
  return fitsRangeOnOneLine(start, end, replacement, file)
}

const MaximumCallLineWidth = 120
function fitsRangeOnOneLine(start: number, end: number, replacement: string, file: TypeScript.SourceFile): boolean {
  const startLineStart = file.getLineStarts()[file.getLineAndCharacterOfPosition(start).line]
  const lineEnd = file.text.indexOf(NewlineCharacter, end)
  const endLineEnd = lineEnd < 0 ? file.text.length : lineEnd
  const prefix = file.text.slice(startLineStart, start)
  const suffix = file.text.slice(end, endLineEnd)
  const suffixWithoutCarriageReturn = suffix.endsWith(CarriageReturnCharacter) ? suffix.slice(0, -1) : suffix
  return prefix.length + replacement.length + suffixWithoutCarriageReturn.length <= MaximumCallLineWidth
}
