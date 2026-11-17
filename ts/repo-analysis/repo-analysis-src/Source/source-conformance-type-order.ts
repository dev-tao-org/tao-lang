import { CarriageReturnCharacter, NewlineCharacter } from '@shared'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

export { analyzeSignatureTypeOrder, containsNode, movableStart }

type SignatureTypeOrder = Map<TypeScript.SourceFile, TypeScript.TextChange[]>

/** analyzeSignatureTypeOrder locates single-consumer signature types declared after their functions. */
function analyzeSignatureTypeOrder(
  program: TypeScript.Program,
  editableSources: ReadonlySet<TypeScript.SourceFile>,
): SignatureTypeOrder {
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

type SignatureDeclaration = TypeScript.TypeAliasDeclaration | TypeScript.InterfaceDeclaration
type TypeConsumer = { owner: TypeScript.Statement; signature: boolean }
type SignatureCandidate = {
  declaration: SignatureDeclaration
  owner?: TypeScript.Statement
  shared: boolean
  signature: boolean
}
type SignatureCandidates = Map<TypeScript.Symbol, SignatureCandidate>
type FileTypeInsertions = Map<TypeScript.SourceFile, Map<number, TypeScript.TextChange>>
type FunctionBodyNode = TypeScript.Node | undefined
type FunctionBodyOwner = TypeScript.SignatureDeclaration & { body: FunctionBodyNode }

function collectCandidates(
  editableSources: ReadonlySet<TypeScript.SourceFile>,
  checker: TypeScript.TypeChecker,
): SignatureCandidates {
  const candidates: SignatureCandidates = new Map()
  for (const file of editableSources) {
    for (const declaration of file.statements) {
      if (!TypeScript.isTypeAliasDeclaration(declaration) && !TypeScript.isInterfaceDeclaration(declaration)) {
        continue
      }
      const symbol = checker.getSymbolAtLocation(declaration.name)
      const ambient = declaration.modifiers?.some(modifier => modifier.kind === TypeScript.SyntaxKind.DeclareKeyword)
      if (symbol?.declarations?.length === 1 && !ambient && movableStart(declaration) !== undefined) {
        candidates.set(symbol, { declaration, shared: false, signature: false })
      }
    }
  }
  return candidates
}

function collectConsumers(
  file: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
  candidates: SignatureCandidates,
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
        recordConsumer(candidate, node, checker)
      }
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
}

function recordConsumer(
  candidate: SignatureCandidate,
  node: TypeScript.Identifier,
  checker: TypeScript.TypeChecker,
): void {
  const consumer = resolveConsumer(node, checker)
  if (!consumer || consumer.owner.getSourceFile() !== candidate.declaration.getSourceFile()) {
    candidate.shared = true
    return
  }
  if (candidate.owner && candidate.owner !== consumer.owner) {
    candidate.shared = true
    return
  }
  candidate.owner = consumer.owner
  candidate.signature ||= consumer.signature
}

function resolveConsumer(node: TypeScript.Node, checker: TypeScript.TypeChecker): TypeConsumer | undefined {
  let ancestor = node.parent
  while (ancestor && !TypeScript.isSourceFile(ancestor)) {
    if (TypeScript.isTypeAliasDeclaration(ancestor) || TypeScript.isInterfaceDeclaration(ancestor)) {
      return undefined
    }
    if (TypeScript.isFunctionLike(ancestor)) {
      const owner = resolveFunctionOwner(ancestor, checker)
      const body = hasFunctionBody(ancestor) ? ancestor.body : undefined
      if (owner) {
        return { owner, signature: !body || !containsNode(body, node) }
      }
    }
    if (TypeScript.isClassLike(ancestor)) {
      return undefined
    }
    ancestor = ancestor.parent
  }
  return undefined
}

function hasFunctionBody(node: TypeScript.SignatureDeclaration): node is FunctionBodyOwner {
  return 'body' in node
}

function resolveFunctionOwner(
  node: TypeScript.SignatureDeclaration,
  checker: TypeScript.TypeChecker,
): TypeScript.Statement | undefined {
  if (TypeScript.isFunctionDeclaration(node) && TypeScript.isSourceFile(node.parent)) {
    const symbol = node.name && checker.getSymbolAtLocation(node.name)
    return symbol?.declarations?.find(TypeScript.isFunctionDeclaration) ?? node
  }
  if (TypeScript.isArrowFunction(node) || TypeScript.isFunctionExpression(node)) {
    const declaration = node.parent
    if (TypeScript.isVariableDeclaration(declaration) && TypeScript.isVariableDeclarationList(declaration.parent)) {
      const statement = declaration.parent.parent
      if (TypeScript.isVariableStatement(statement) && TypeScript.isSourceFile(statement.parent)) {
        return declaration.parent.declarations.length === 1 ? statement : undefined
      }
    }
  }
  return resolveCommandOwner(node)
}

function resolveCommandOwner(node: TypeScript.Node): TypeScript.ExportAssignment | undefined {
  let ancestor = node.parent
  while (ancestor && !TypeScript.isSourceFile(ancestor)) {
    if (TypeScript.isClassLike(ancestor) || TypeScript.isFunctionLike(ancestor)) {
      return undefined
    }
    if (TypeScript.isExportAssignment(ancestor)) {
      const expression = ancestor.expression
      const registers = TypeScript.isCallExpression(expression) && TypeScript.isIdentifier(expression.expression)
      return registers && expression.expression.text === 'registerCommand' ? ancestor : undefined
    }
    ancestor = ancestor.parent
  }
  return undefined
}

/** containsNode checks whether a source node is inside a declaration. */
function containsNode(owner: TypeScript.Node, node: TypeScript.Node): boolean {
  return owner.pos <= node.pos && node.end <= owner.end && owner.getSourceFile() === node.getSourceFile()
}

function collectChanges(candidates: SignatureCandidates): SignatureTypeOrder {
  const changes: SignatureTypeOrder = new Map()
  const insertions: FileTypeInsertions = new Map()
  for (const candidate of candidates.values()) {
    const { declaration, owner } = candidate
    if (!owner) {
      continue
    }
    if (candidate.shared || !candidate.signature || declaration.pos < owner.pos) {
      continue
    }
    const start = movableStart(declaration)
    const insertion = movableStart(owner)
    if (start === undefined || insertion === undefined) {
      continue
    }
    const file = declaration.getSourceFile()
    const edits = changes.get(file) ?? []
    edits.push({ span: { start, length: declaration.end - start }, newText: '' })
    const text = file.text.slice(start, declaration.end) + NewlineCharacter
    const fileInsertions = insertions.get(file) ?? new Map<number, TypeScript.TextChange>()
    const existing = fileInsertions.get(insertion)
    if (existing) {
      existing.newText += text
    } else {
      const change = { span: { start: insertion, length: 0 }, newText: text }
      fileInsertions.set(insertion, change)
      edits.push(change)
    }
    insertions.set(file, fileInsertions)
    changes.set(file, edits)
  }
  return changes
}

/** movableStart finds a declaration's safe source start while preserving leading comments. */
function movableStart(node: TypeScript.Node): number | undefined {
  const file = node.getSourceFile()
  const trivia = file.text.slice(node.getFullStart(), node.getStart(file))
  const sameLine = trivia.slice(0, trivia.indexOf(NewlineCharacter) + 1)
  const trailing = file.text.slice(
    node.end,
    file.text.indexOf(NewlineCharacter, node.end) < 0
      ? file.text.length
      : file.text.indexOf(NewlineCharacter, node.end),
  )
  const directive = trivia.includes('@ts-') || trivia.includes('eslint') || trivia.includes('prettier')
  const leadingComment = sameLine.includes('//') || sameLine.includes('/*')
  const trailingComment = trailing.includes('//') || trailing.includes('/*')
  if (directive || leadingComment || trailingComment) {
    return undefined
  }
  let start = node.getFullStart()
  while (
    start < node.getStart(file)
    && (file.text[start] === NewlineCharacter || file.text[start] === CarriageReturnCharacter)
  ) {
    start++
  }
  return start
}
