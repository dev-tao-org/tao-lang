import { NewlineCharacter } from '@shared'
import { TypeScript } from '@tao/shared/typescript'
import { containsNode, movableStart } from './source-conformance-type-order'

export { analyzeConstantOrder }

type ConstantOrderChanges = Map<TypeScript.SourceFile, TypeScript.TextChange[]>
type ConstantCandidate = { declaration: TypeScript.VariableStatement; owner?: TypeScript.Statement; shared: boolean }
type ConstantCandidates = Map<TypeScript.Symbol, ConstantCandidate>
type ConstantInsertions = Map<TypeScript.SourceFile, Map<number, TypeScript.TextChange>>
type CallableFunction = TypeScript.ArrowFunction | TypeScript.FunctionExpression
type MaybeStatement = TypeScript.Statement | undefined

const InertInitializerKinds = new Set([
  TypeScript.SyntaxKind.StringLiteral,
  TypeScript.SyntaxKind.NumericLiteral,
  TypeScript.SyntaxKind.BigIntLiteral,
  TypeScript.SyntaxKind.NoSubstitutionTemplateLiteral,
  TypeScript.SyntaxKind.RegularExpressionLiteral,
  TypeScript.SyntaxKind.TrueKeyword,
  TypeScript.SyntaxKind.FalseKeyword,
  TypeScript.SyntaxKind.NullKeyword,
])
const ClassEvaluationModifiers = new Set([TypeScript.SyntaxKind.StaticKeyword])
const ClassMethodKinds = new Set([
  TypeScript.SyntaxKind.MethodDeclaration,
  TypeScript.SyntaxKind.Constructor,
  TypeScript.SyntaxKind.GetAccessor,
  TypeScript.SyntaxKind.SetAccessor,
])
const NonEvaluatedStatementKinds = new Set([
  TypeScript.SyntaxKind.ImportDeclaration,
  TypeScript.SyntaxKind.ExportDeclaration,
  TypeScript.SyntaxKind.FunctionDeclaration,
  TypeScript.SyntaxKind.TypeAliasDeclaration,
  TypeScript.SyntaxKind.InterfaceDeclaration,
  TypeScript.SyntaxKind.EmptyStatement,
])

/** analyzeConstantOrder places inert single-consumer constants beside their module-level owner. */
function analyzeConstantOrder(
  program: TypeScript.Program,
  editableSources: ReadonlySet<TypeScript.SourceFile>,
): ConstantOrderChanges {
  const checker = program.getTypeChecker()
  const candidates = collectCandidates(editableSources, checker)
  const names = new Set([...candidates.keys()].map(symbol => symbol.name))
  for (const file of program.getSourceFiles()) {
    if (!program.isSourceFileDefaultLibrary(file)) {
      collectConsumers(file, checker, candidates, names)
    }
  }
  return collectChanges(candidates)
}

function collectCandidates(
  editableSources: ReadonlySet<TypeScript.SourceFile>,
  checker: TypeScript.TypeChecker,
): ConstantCandidates {
  const candidates: ConstantCandidates = new Map()
  for (const file of editableSources) {
    for (const statement of file.statements) {
      if (!TypeScript.isVariableStatement(statement)) {
        continue
      }
      const declaration = singleConstDeclaration(statement)
      const initializer = declaration?.initializer
      if (!declaration || !initializer || !InertInitializerKinds.has(initializer.kind)) {
        continue
      }
      const symbol = checker.getSymbolAtLocation(declaration.name)
      const exported = statement.modifiers?.some(modifier =>
        modifier.kind === TypeScript.SyntaxKind.ExportKeyword || modifier.kind === TypeScript.SyntaxKind.DefaultKeyword
      )
      if (symbol?.declarations?.length === 1 && !exported && movableStart(statement) !== undefined) {
        candidates.set(symbol, { declaration: statement, shared: false })
      }
    }
  }
  return candidates
}

function singleConstDeclaration(statement: TypeScript.VariableStatement): TypeScript.VariableDeclaration | undefined {
  if (statement.declarationList.declarations.length !== 1) {
    return undefined
  }
  const [declaration] = statement.declarationList.declarations
  if ((statement.declarationList.flags & TypeScript.NodeFlags.Const) === 0 || !declaration) {
    return undefined
  }
  if (!TypeScript.isIdentifier(declaration.name) || !declaration.initializer) {
    return undefined
  }
  return declaration
}

function collectConsumers(
  file: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
  candidates: ConstantCandidates,
  names: Set<string>,
): void {
  const visit = (node: TypeScript.Node): void => {
    if (TypeScript.isIdentifier(node) && names.has(node.text)) {
      const symbol = checker.getSymbolAtLocation(node)
      const resolved = symbol && (symbol.flags & TypeScript.SymbolFlags.Alias)
        ? checker.getAliasedSymbol(symbol)
        : symbol
      const candidate = resolved && candidates.get(resolved)
      if (candidate && !containsNode(candidate.declaration, node)) {
        recordConsumer(candidate, node)
      }
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
}

function recordConsumer(candidate: ConstantCandidate, node: TypeScript.Node): void {
  const consumer = resolveConsumer(node)
  if (!consumer || consumer.getSourceFile() !== candidate.declaration.getSourceFile()) {
    candidate.shared = true
    return
  }
  if (candidate.owner && candidate.owner !== consumer) {
    candidate.shared = true
    return
  }
  candidate.owner = consumer
}

function resolveConsumer(node: TypeScript.Node): TypeScript.Statement | undefined {
  let ancestor = node.parent
  while (ancestor && !TypeScript.isSourceFile(ancestor)) {
    if (TypeScript.isFunctionDeclaration(ancestor) && TypeScript.isSourceFile(ancestor.parent)) {
      return firstFunctionGroupDeclaration(ancestor)
    }
    if (TypeScript.isArrowFunction(ancestor) || TypeScript.isFunctionExpression(ancestor)) {
      const owner = resolveCallableOwner(ancestor)
      if (owner) {
        return owner
      }
    }
    if (TypeScript.isClassLike(ancestor)) {
      const owner = resolveMethodClassOwner(ancestor, node)
      if (owner) {
        return owner
      }
    }
    if (TypeScript.isExportAssignment(ancestor) && isCommandRegistration(ancestor)) {
      if (isDeferredRegistrationCallback(node, ancestor)) {
        return ancestor
      }
    }
    ancestor = ancestor.parent
  }
}

function resolveCallableOwner(node: CallableFunction): TypeScript.Statement | undefined {
  const declaration = node.parent
  if (!TypeScript.isVariableDeclaration(declaration) || !TypeScript.isVariableDeclarationList(declaration.parent)) {
    return undefined
  }
  if (declaration.parent.declarations.length !== 1) {
    return undefined
  }
  const statement = declaration.parent.parent
  if (TypeScript.isVariableStatement(statement) && TypeScript.isSourceFile(statement.parent)) {
    return statement
  }
}

function firstFunctionGroupDeclaration(node: TypeScript.FunctionDeclaration): TypeScript.FunctionDeclaration {
  const statements = node.getSourceFile().statements
  let first = node
  let index = statements.indexOf(node) - 1
  while (index >= 0) {
    const previous = statements[index]
    if (!isPreviousOverload(previous, node)) {
      break
    }
    first = previous
    index--
  }
  return first
}

function isPreviousOverload(
  statement: MaybeStatement,
  implementation: TypeScript.FunctionDeclaration,
): statement is TypeScript.FunctionDeclaration {
  if (!statement || !TypeScript.isFunctionDeclaration(statement)) {
    return false
  }
  return statement.name?.text === implementation.name?.text && !statement.body
}

function resolveMethodClassOwner(
  classNode: TypeScript.ClassLikeDeclaration,
  node: TypeScript.Node,
): TypeScript.Statement | undefined {
  if (!TypeScript.isClassDeclaration(classNode) || !TypeScript.isSourceFile(classNode.parent)) {
    return undefined
  }
  if (classNode.heritageClauses?.length || hasClassEvaluation(classNode)) {
    return undefined
  }
  const member = classNode.members.find(member => containsNode(member, node))
  return member && ClassMethodKinds.has(member.kind) ? classNode : undefined
}

function hasClassEvaluation(classNode: TypeScript.ClassLikeDeclaration): boolean {
  return hasDecorators(classNode) || classNode.members.some(hasMemberEvaluation)
}

function hasMemberEvaluation(member: TypeScript.ClassElement): boolean {
  if (TypeScript.isClassStaticBlockDeclaration(member) || hasDecorators(member) || hasComputedMemberName(member)) {
    return true
  }
  if (!TypeScript.canHaveModifiers(member)) {
    return false
  }
  return TypeScript.getModifiers(member)?.some(modifier => ClassEvaluationModifiers.has(modifier.kind)) ?? false
}

function hasComputedMemberName(member: TypeScript.ClassElement): boolean {
  if (TypeScript.isPropertyDeclaration(member)) {
    return TypeScript.isComputedPropertyName(member.name)
  }
  if (TypeScript.isMethodDeclaration(member)) {
    return TypeScript.isComputedPropertyName(member.name)
  }
  if (TypeScript.isGetAccessorDeclaration(member)) {
    return TypeScript.isComputedPropertyName(member.name)
  }
  if (TypeScript.isSetAccessorDeclaration(member)) {
    return TypeScript.isComputedPropertyName(member.name)
  }
  return false
}

function hasDecorators(node: TypeScript.Node): boolean {
  return TypeScript.canHaveDecorators(node) && (TypeScript.getDecorators(node)?.length ?? 0) > 0
}

function isCommandRegistration(node: TypeScript.ExportAssignment): boolean {
  if (!TypeScript.isCallExpression(node.expression)) {
    return false
  }
  const callee = node.expression.expression
  return TypeScript.isIdentifier(callee) && callee.text === 'registerCommand'
}

function isDeferredRegistrationCallback(node: TypeScript.Node, registration: TypeScript.ExportAssignment): boolean {
  for (let ancestor = node.parent; ancestor && ancestor !== registration; ancestor = ancestor.parent) {
    if (isRegisteredCallback(ancestor, registration)) {
      return true
    }
  }
  return false
}

function isRegisteredCallback(node: TypeScript.Node, registration: TypeScript.ExportAssignment): boolean {
  const isMethod = TypeScript.isMethodDeclaration(node)
  const property = node.parent
  if (!isMethod && !isFunctionProperty(node, property)) {
    return false
  }
  const object = isMethod ? property : property.parent
  if (!TypeScript.isObjectLiteralExpression(object) || !TypeScript.isCallExpression(registration.expression)) {
    return false
  }
  return registration.expression.arguments.includes(object)
}

function isFunctionProperty(node: TypeScript.Node, property: TypeScript.Node): boolean {
  const callable = TypeScript.isArrowFunction(node) || TypeScript.isFunctionExpression(node)
  return callable && TypeScript.isPropertyAssignment(property) && property.initializer === node
}

function collectChanges(candidates: ConstantCandidates): ConstantOrderChanges {
  const changes: ConstantOrderChanges = new Map()
  const insertions: ConstantInsertions = new Map()
  for (const candidate of candidates.values()) {
    const { declaration, owner } = candidate
    if (!owner) {
      continue
    }
    if (candidate.shared || declaration === owner) {
      continue
    }
    const start = movableStart(declaration)
    const insertion = movableStart(owner)
    if (start === undefined || insertion === undefined || !canMoveBesideOwner(owner, declaration)) {
      continue
    }
    if (declaration.pos < owner.pos && isAdjacentBefore(declaration, owner)) {
      continue
    }
    addMove(changes, insertions, declaration, start, insertion)
  }
  return changes
}

function canMoveBesideOwner(owner: TypeScript.Statement, declaration: TypeScript.VariableStatement): boolean {
  return owner.pos < declaration.pos ? safeGap(owner, declaration) : safeGap(declaration, owner)
}

function isAdjacentBefore(declaration: TypeScript.VariableStatement, owner: TypeScript.Statement): boolean {
  const statements = declaration.getSourceFile().statements
  return statements.indexOf(owner) === statements.indexOf(declaration) + 1
}

function safeGap(earlier: TypeScript.Statement, later: TypeScript.Statement): boolean {
  const file = earlier.getSourceFile()
  const earlierIndex = file.statements.indexOf(earlier)
  const laterIndex = file.statements.indexOf(later)
  if (earlierIndex < 0 || laterIndex <= earlierIndex) {
    return false
  }
  return file.statements.slice(earlierIndex + 1, laterIndex).every(isNonEvaluatedStatement)
}

function isNonEvaluatedStatement(statement: TypeScript.Statement): boolean {
  return NonEvaluatedStatementKinds.has(statement.kind)
}

function addMove(
  changes: ConstantOrderChanges,
  insertions: ConstantInsertions,
  declaration: TypeScript.VariableStatement,
  start: number,
  insertion: number,
): void {
  const file = declaration.getSourceFile()
  const edits = changes.get(file) ?? []
  const fileInsertions = insertions.get(file) ?? new Map<number, TypeScript.TextChange>()
  const existing = fileInsertions.get(insertion)
  const text = file.text.slice(start, declaration.end) + NewlineCharacter
  if (existing) {
    existing.newText += text
  } else {
    const change = { span: { start: insertion, length: 0 }, newText: text }
    fileInsertions.set(insertion, change)
    edits.push(change)
  }
  edits.push({ span: { start, length: declaration.end - start }, newText: '' })
  insertions.set(file, fileInsertions)
  changes.set(file, edits)
}
