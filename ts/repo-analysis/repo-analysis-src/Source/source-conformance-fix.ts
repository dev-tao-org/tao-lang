import { Range, Source } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { getSingleLineCallChanges } from './source-conformance-call-layout'
import { analyzeConstantOrder } from './source-conformance-constant-order'
import { getQuotedObjectKeyChanges } from './source-conformance-object-keys'
import { optionalAccessIssue, optionalAccessResult } from './source-conformance-optional'
import { conformanceSources, createConformanceProgram } from './source-conformance-program'
import { analyzeSignatureTypeOrder } from './source-conformance-type-order'

type SourceConformanceFixOptions = { excludedFiles?: readonly string[] }

/** fixSourceConformance applies safe type-aware source fixes within the new workspace. */
export async function fixSourceConformance(
  root = Repo.getWorkspaceRoot(),
  options: SourceConformanceFixOptions = {},
): Promise<number> {
  const sources = await conformanceSources(root)
  const program = createConformanceProgram(root, sources)
  const checker = program.getTypeChecker()
  const constantOrder = analyzeConstantOrder(program)
  const typeOrder = analyzeSignatureTypeOrder(program)
  const excludedFiles = new Set(options.excludedFiles?.map(filename => Path.resolve(root, filename)) ?? [])
  let changed = 0
  for (const filename of sources) {
    if (excludedFiles.has(Path.resolve(filename))) {
      continue
    }
    const file = program.getSourceFile(filename)
    if (!file) {
      continue
    }
    const edits = collectSourceChanges(file, checker, typeOrder.get(file) ?? [], constantOrder.get(file) ?? [])
    if (edits.length === 0) {
      continue
    }
    const text = applyEdits(file.text, edits)
    await FS.write(filename, finishCallLayouts(filename, text))
    changed++
  }
  return changed
}

function finishCallLayouts(filename: string, text: string): string {
  while (true) {
    const file = TypeScript.createSourceFile(filename, text, TypeScript.ScriptTarget.Latest, true)
    const edits = getSingleLineCallChanges(file)
    if (edits.length === 0) {
      return text
    }
    // Each layout edit removes a line break, so nested layouts eventually stop changing.
    const updated = applyEdits(text, edits)
    if (updated === text) {
      return text
    }
    text = updated
  }
}

function applyEdits(text: string, edits: TypeScript.TextChange[]): string {
  for (const edit of edits.sort((first, second) => second.span.start - first.span.start)) {
    text = Source.replace(text, Range(edit.span.start, edit.span.start + edit.span.length), edit.newText)
  }
  return text
}

function collectSourceChanges(
  file: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
  typeChanges: TypeScript.TextChange[],
  constantChanges: TypeScript.TextChange[],
): TypeScript.TextChange[] {
  const structuralChanges = [...typeChanges, ...constantChanges]
  const accessChanges = optionalAccessChanges(file, checker)
    .filter(edit => !overlapsChanges(edit, structuralChanges))
  const callChanges = getSingleLineCallChanges(file)
    .filter(edit => !overlapsChanges(edit, structuralChanges) && !overlapsChanges(edit, accessChanges))
  const previousChanges = [...structuralChanges, ...accessChanges, ...callChanges]
  const quoteChanges = getQuotedObjectKeyChanges(file)
    .filter(edit => !overlapsChanges(edit, previousChanges))
  return [...previousChanges, ...quoteChanges]
}

function overlapsChanges(edit: TypeScript.TextChange, changes: TypeScript.TextChange[]): boolean {
  return changes.some(change =>
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
