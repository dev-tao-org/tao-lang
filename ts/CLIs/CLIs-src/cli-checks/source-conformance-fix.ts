import { FileSystem, Repo } from '@shared/os'
import * as TypeScript from 'typescript'
import { IO } from '../cli-kit/cli-kit'
import { optionalAccessIssue, optionalAccessResult } from './source-conformance-optional'
import { conformanceSources, createConformanceProgram } from './source-conformance-program'
import { analyzeSignatureTypeOrder } from './source-conformance-type-order'

/** fixSourceConformance applies safe type-aware source fixes within the new workspace. */
export async function fixSourceConformance(root = Repo.getWorkspaceRoot()): Promise<void> {
  const sources = await conformanceSources(root)
  const program = createConformanceProgram(root, sources)
  const checker = program.getTypeChecker()
  const typeOrder = analyzeSignatureTypeOrder(program)
  let changed = 0
  for (const filename of sources) {
    const file = program.getSourceFile(filename)
    if (!file) {
      continue
    }
    const typeChanges = typeOrder.get(file) ?? []
    const edits = [
      ...typeChanges,
      ...optionalAccessChanges(file, checker).filter(edit => !overlapsMovedType(edit, typeChanges)),
    ]
    if (edits.length === 0) {
      continue
    }
    let text = file.text
    for (const edit of edits.sort((first, second) => second.span.start - first.span.start)) {
      text = text.slice(0, edit.span.start) + edit.newText + text.slice(edit.span.start + edit.span.length)
    }
    await FileSystem.write(filename, text)
    changed++
  }
  IO.print(`Fixed source conformance: ${changed} file(s)`)
}

function overlapsMovedType(edit: TypeScript.TextChange, typeChanges: TypeScript.TextChange[]): boolean {
  return typeChanges.some(change =>
    change.span.length > 0
    && edit.span.start < change.span.start + change.span.length
    && change.span.start < edit.span.start + edit.span.length
  )
}

function optionalAccessChanges(file: TypeScript.SourceFile, checker: TypeScript.TypeChecker): TypeScript.TextChange[] {
  const changes: TypeScript.TextChange[] = []
  const printer = TypeScript.createPrinter()
  const visit = (node: TypeScript.Node): void => {
    if (isFixable(node, checker)) {
      const result = TypeScript.transform(node, [context => root => rewrite(root, checker, context)])
      changes.push({
        span: { start: node.getStart(file), length: node.getWidth(file) },
        newText: printer.printNode(TypeScript.EmitHint.Expression, result.transformed[0], file),
      })
      result.dispose()
      return
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return changes
}

function rewrite(
  node: TypeScript.Node,
  checker: TypeScript.TypeChecker,
  context: TypeScript.TransformationContext,
): TypeScript.Node {
  const fixable = isFixable(node, checker)
  const updated = TypeScript.visitEachChild(node, child => rewrite(child, checker, context), context)
  return fixable && TypeScript.isConditionalExpression(updated) ? optionalAccessResult(updated.whenTrue) : updated
}

function isFixable(node: TypeScript.Node, checker: TypeScript.TypeChecker): boolean {
  if (!optionalAccessIssue(node, checker)) {
    return false
  }
  if (TypeScript.isConditionalExpression(node) && hasResultAssertion(node.whenTrue)) {
    return false
  }
  // Keep authored comments intact; these cases remain check diagnostics for manual correction.
  const text = node.getText()
  return !text.includes('/*') && !text.includes('//')
}

function hasResultAssertion(node: TypeScript.Expression): boolean {
  if (TypeScript.isParenthesizedExpression(node)) {
    return hasResultAssertion(node.expression)
  }
  return TypeScript.isAsExpression(node) || TypeScript.isTypeAssertionExpression(node)
}
