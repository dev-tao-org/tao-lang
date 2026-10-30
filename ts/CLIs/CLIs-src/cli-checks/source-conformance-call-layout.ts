import { Regxs } from '@shared'
import * as TypeScript from 'typescript'

/** getSingleLineCallChanges collapses fitting multiline calls with only bare identifier arguments. */
export function getSingleLineCallChanges(file: TypeScript.SourceFile): TypeScript.TextChange[] {
  const changes: TypeScript.TextChange[] = []
  const visit = (node: TypeScript.Node): void => {
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
  const prefix = file.text.slice(node.getStart(file), node.arguments.pos)
  const callText = node.getText(file)
  if (containsComment(callText)) {
    return
  }
  if (hasMultilineCallee(node, file)) {
    return
  }
  if (Regxs.NewlineCharacter.test(prefix)) {
    return
  }
  if (!isMultiline(node, file)) {
    return
  }
  const argumentsText = node.arguments.map(argument => argument.getText(file)).join(', ')
  const replacement = prefix + argumentsText + ')'
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

function hasMultilineCallee(node: TypeScript.CallExpression, file: TypeScript.SourceFile): boolean {
  const calleeText = node.expression.getText(file)
  const typeArgumentsText = node.typeArguments
    ? file.text.slice(node.expression.end, node.typeArguments.end)
    : ''
  return Regxs.NewlineCharacter.test(calleeText) || Regxs.NewlineCharacter.test(typeArgumentsText)
}

function isMultiline(node: TypeScript.CallExpression, file: TypeScript.SourceFile): boolean {
  const firstLine = file.getLineAndCharacterOfPosition(node.getStart(file)).line
  const lastLine = file.getLineAndCharacterOfPosition(node.getEnd() - 1).line
  return firstLine !== lastLine
}

const MaximumCallLineWidth = 120

function fitsOnOneLine(node: TypeScript.CallExpression, replacement: string, file: TypeScript.SourceFile): boolean {
  const start = node.getStart(file)
  const end = node.getEnd()
  const startLineStart = file.getLineStarts()[file.getLineAndCharacterOfPosition(start).line]
  const lineEnd = file.text.indexOf('\n', end)
  const endLineEnd = lineEnd < 0 ? file.text.length : lineEnd
  const prefix = file.text.slice(startLineStart, start)
  const suffix = file.text.slice(end, endLineEnd)
  const suffixWithoutCarriageReturn = suffix.endsWith('\r') ? suffix.slice(0, -1) : suffix
  return prefix.length + replacement.length + suffixWithoutCarriageReturn.length <= MaximumCallLineWidth
}
