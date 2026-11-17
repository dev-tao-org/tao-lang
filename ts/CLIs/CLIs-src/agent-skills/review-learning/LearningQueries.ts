import * as RepoAnalysis from '@repo-analysis'
import { Errors, Lists, Range } from '@shared'
import { Path, Platform } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { encodeLearningSnapshot, isInScope, snapshotScope } from './LearningStore'
import type { Correction, Finding, QueryRule, Scan } from './LearningTypes'
import { validateCorrectionAuthority } from './LearningValidation'

/** runCandidateScan records syntax or symbol candidates against an immutable coverage snapshot. */
export async function runCandidateScan(root: string, correction: Correction, selected: string[]): Promise<Scan> {
  validateCorrectionAuthority(root, correction)
  const snapshot = await snapshotScope(root, correction)
  const files = Object.keys(snapshot.files)
  const included = selected.length ? files.filter(file => isInScope(file, selected)) : files
  const program = RepoAnalysis.createConformanceProgram(root, files.map(file => Path.join(root, file)))
  const findings = queryProgram(program, root, included, correction.rule)
  const after = await snapshotScope(root, correction)
  if (encodeLearningSnapshot(snapshot) !== encodeLearningSnapshot(after)) {
    Errors.ThrowUserInput('Source or configuration changed during the scan; rerun against a stable snapshot.')
  }
  return {
    id: Platform.randomUUID(),
    correction,
    queryVersion: 1,
    ...snapshot,
    selected: included,
    complete: included.length === files.length,
    findings,
  }
}

function queryProgram(program: TypeScript.Program, root: string, files: string[], rule: QueryRule): Finding[] {
  const checker = program.getTypeChecker()
  const target = rule.kind === 'call-symbol' ? resolveTarget(program, checker, root, rule) : undefined
  const result: Finding[] = []
  for (const file of files) {
    const source = program.getSourceFile(Path.join(root, file))!
    const visit = (node: TypeScript.Node): void => {
      if (matchesNode(node, source, checker, rule, target)) {
        const start = node.getStart(source)
        result.push({
          file,
          range: Range(start, node.end),
          line: source.getLineAndCharacterOfPosition(start).line + 1,
          message: `${rule.kind} candidate; contextual judgment required`,
        })
      }
      TypeScript.forEachChild(node, visit)
    }
    visit(source)
  }
  return result
}

function resolveTarget(
  program: TypeScript.Program,
  checker: TypeScript.TypeChecker,
  root: string,
  rule: QueryRule,
): TypeScript.Symbol {
  const source = program.getSourceFile(Path.join(root, rule.declarationFile!))
  const found: TypeScript.Symbol[] = []
  const visit = (node: TypeScript.Node): void => {
    if (TypeScript.isIdentifier(node) && node.text === rule.declarationName) {
      const symbol = checker.getSymbolAtLocation(node)
      if (symbol?.declarations?.some(declaration => declaration.getSourceFile() === source)) {
        found.push(symbol)
      }
    }
    TypeScript.forEachChild(node, visit)
  }
  if (source) {
    visit(source)
  }
  const unique = Lists.unique(found)
  if (unique.length !== 1) {
    Errors.ThrowUserInput('call-symbol requires one unambiguous declaration in the scanned scope.')
  }
  return unique[0]!
}

function matchesNode(
  node: TypeScript.Node,
  source: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
  rule: QueryRule,
  target?: TypeScript.Symbol,
): boolean {
  if (rule.kind === 'call-name' && TypeScript.isCallExpression(node)) {
    return getCallName(node.expression) === rule.name
  }
  if (rule.kind === 'call-symbol' && TypeScript.isCallExpression(node)) {
    const expression = TypeScript.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression
    const symbol = checker.getSymbolAtLocation(expression)
    const resolved = symbol && (symbol.flags & TypeScript.SymbolFlags.Alias) ? checker.getAliasedSymbol(symbol) : symbol
    return resolved === target
  }
  if (rule.kind === 'function-length') {
    return hasLongFunctionBody(node, source, rule.maxLines!)
  }
  return rule.kind === 'returned-method' && isReturnedObjectMethod(node)
}

function hasLongFunctionBody(node: TypeScript.Node, source: TypeScript.SourceFile, maximum: number): boolean {
  if (!TypeScript.isFunctionLike(node) || !('body' in node)) {
    return false
  }
  const body = node.body
  if (!body) {
    return false
  }
  const first = source.getLineAndCharacterOfPosition(body.getStart(source)).line
  const last = source.getLineAndCharacterOfPosition(body.end).line
  return last - first - 1 > maximum
}

function isReturnedObjectMethod(node: TypeScript.Node): boolean {
  if (!TypeScript.isMethodDeclaration(node) || !TypeScript.isObjectLiteralExpression(node.parent)) {
    return false
  }
  const statements = node.body?.statements
  return statements?.length === 1 && TypeScript.isReturnStatement(statements[0]!)
}

function getCallName(expression: TypeScript.LeftHandSideExpression): string | undefined {
  if (TypeScript.isIdentifier(expression)) {
    return expression.text
  }
  if (TypeScript.isPropertyAccessExpression(expression)) {
    return expression.name.text
  }
  return undefined
}
