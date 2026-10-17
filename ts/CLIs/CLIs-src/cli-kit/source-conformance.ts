import { Errors, Time } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import * as TypeScript from 'typescript'
import { IO } from './cli-kit'

type ApiGroup = { name?: string; nodes: TypeScript.Node[]; exported: boolean }

/** checkSourceConformance checks new TypeScript sources without running tests or loading a type checker. */
export async function checkSourceConformance(root: string): Promise<void> {
  const started = Time.nowMs()
  const issues: string[] = []
  for (const filename of await FileSystem.sourceFiles(root + '/ts')) {
    issues.push(
      ...sourceConformanceIssues(
        Path.relative(root, filename).replaceAll('\\', '/'),
        await FileSystem.file(filename).text(),
      ),
    )
  }
  IO.print('Checked source conformance: ' + issues.length + ' issue(s) in ' + Math.round(Time.nowMs() - started) + 'ms')
  if (issues.length > 0) {
    Errors.ThrowUserInput(issues.join('\n'))
  }
}

/** sourceConformanceIssues checks repository-relative TypeScript source for API docs and source conventions. */
export function sourceConformanceIssues(filename: string, source: string): string[] {
  return new SourceConformanceChecker(filename, source).check()
}

class SourceConformanceChecker {
  private readonly file: TypeScript.SourceFile
  private readonly issues: string[] = []
  private readonly publicDocs = new Set<number>()
  private readonly publicNamespaces = new Set<TypeScript.Node>()
  private readonly comments = new Map<number, TypeScript.CommentRange>()

  constructor(private readonly filename: string, private readonly source: string) {
    this.file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  }

  check(): string[] {
    this.visit(this.file)
    this.checkComments()
    return this.issues
  }

  private visit(node: TypeScript.Node): void {
    this.checkNode(node)
    this.collectComments(node)
    for (const child of node.getChildren(this.file)) {
      if (!TypeScript.isJSDoc(child)) {
        this.visit(child)
      }
    }
  }

  private checkNode(node: TypeScript.Node): void {
    if (isFunctionProperty(node)) {
      this.report(node.getStart(this.file), 'function implementations in objects must use method syntax')
    }
    const platformIssue = platformAccessIssue(node, this.filename)
    if (platformIssue) {
      this.report(node.getStart(this.file), platformIssue)
    }
    const body = functionBody(node)
    if (body) {
      this.checkFunctionBody(body)
    }
    if (TypeScript.isSourceFile(node)) {
      this.checkScope(node)
    }
    if (TypeScript.isModuleBlock(node) && this.publicNamespaces.has(node.parent)) {
      this.checkScope(node, isAmbientNamespace(node))
    }
    if (TypeScript.isTryStatement(node) && !isTryPrimitive(this.filename)) {
      this.report(node.getStart(this.file), 'use Try from @shared instead of native try/catch/finally')
    }
    const stringIssue = multilineStringIssue(node, this.file)
    if (stringIssue) {
      this.report(node.getStart(this.file), stringIssue)
    }
  }

  private checkFunctionBody(body: TypeScript.ConciseBody): void {
    const lines = functionBodyLineCount(body, this.source, this.file)
    if (lines > 45) {
      this.report(body.getStart(this.file), 'function bodies must contain at most 45 physical lines; found ' + lines)
    }
  }

  private collectComments(node: TypeScript.Node): void {
    // Parser token boundaries keep comment-looking strings, templates and regexes out of the scan.
    for (const range of TypeScript.getLeadingCommentRanges(this.source, node.getFullStart()) ?? []) {
      this.comments.set(range.pos, range)
    }
    for (const range of TypeScript.getTrailingCommentRanges(this.source, node.end) ?? []) {
      this.comments.set(range.pos, range)
    }
  }

  private checkScope(scope: TypeScript.SourceFile | TypeScript.ModuleBlock, implicitExports = false): void {
    const groups = new Map<string, ApiGroup>()
    const anonymous: ApiGroup[] = []
    this.collectScopeDeclarations(scope, implicitExports, groups, anonymous)
    this.collectScopeExports(scope, groups, anonymous)
    this.checkExportedGroups(groups, anonymous)
  }

  private collectScopeDeclarations(
    scope: TypeScript.SourceFile | TypeScript.ModuleBlock,
    implicitExports: boolean,
    groups: Map<string, ApiGroup>,
    anonymous: ApiGroup[],
  ): void {
    for (const statement of scope.statements) {
      if (TypeScript.isVariableStatement(statement)) {
        this.addVariableDeclarations(statement, implicitExports, groups, anonymous)
      } else if (isApiDeclaration(statement)) {
        this.addApiGroup(statement.name?.text, [statement], implicitExports || isExported(statement), groups, anonymous)
      }
    }
  }

  private addVariableDeclarations(
    statement: TypeScript.VariableStatement,
    implicitExports: boolean,
    groups: Map<string, ApiGroup>,
    anonymous: ApiGroup[],
  ): void {
    for (const declaration of statement.declarationList.declarations) {
      for (const name of bindingNames(declaration.name)) {
        this.addApiGroup(
          name.text,
          [name, declaration, statement],
          implicitExports || isExported(statement),
          groups,
          anonymous,
        )
      }
    }
  }

  private addApiGroup(
    name: string | undefined,
    nodes: TypeScript.Node[],
    exported: boolean,
    groups: Map<string, ApiGroup>,
    anonymous: ApiGroup[],
  ): void {
    if (name === undefined) {
      if (exported) {
        anonymous.push({ nodes, exported })
      }
      return
    }
    const group = groups.get(name) ?? { name, nodes: [], exported: false }
    group.nodes.push(...nodes)
    group.exported ||= exported
    groups.set(name, group)
  }

  private collectScopeExports(
    scope: TypeScript.SourceFile | TypeScript.ModuleBlock,
    groups: Map<string, ApiGroup>,
    anonymous: ApiGroup[],
  ): void {
    for (const statement of scope.statements) {
      if (TypeScript.isExportDeclaration(statement)) {
        this.collectForwardingExport(statement, groups)
      } else if (TypeScript.isExportAssignment(statement)) {
        this.collectDefaultExport(statement, groups, anonymous)
      }
    }
  }

  private collectForwardingExport(statement: TypeScript.ExportDeclaration, groups: Map<string, ApiGroup>): void {
    // Forwarding exports may be documented but do not duplicate the declaration's docs.
    this.allowDocs([statement])
    if (isLocalNamedExport(statement)) {
      for (const specifier of statement.exportClause.elements) {
        const group = groups.get(specifier.propertyName?.text ?? specifier.name.text)
        if (group) {
          group.exported = true
        }
      }
    }
  }

  private collectDefaultExport(
    statement: TypeScript.ExportAssignment,
    groups: Map<string, ApiGroup>,
    anonymous: ApiGroup[],
  ): void {
    const group = TypeScript.isIdentifier(statement.expression) ? groups.get(statement.expression.text) : undefined
    if (group) {
      group.exported = true
      group.nodes.push(statement)
    } else {
      anonymous.push({ nodes: [statement], exported: true })
    }
  }

  private checkExportedGroups(groups: Map<string, ApiGroup>, anonymous: ApiGroup[]): void {
    for (const group of [...groups.values(), ...anonymous]) {
      if (group.exported) {
        this.checkExportedGroup(group)
      }
    }
  }

  private checkExportedGroup(group: ApiGroup): void {
    this.checkDocs(group)
    for (const node of group.nodes) {
      if (TypeScript.isModuleDeclaration(node)) {
        this.allowPublicNamespace(node)
      } else {
        this.allowShapeDocs(node)
      }
    }
  }

  private allowPublicNamespace(node: TypeScript.ModuleDeclaration): void {
    let namespace = node
    while (true) {
      this.publicNamespaces.add(namespace)
      if (!namespace.body || !TypeScript.isModuleDeclaration(namespace.body)) {
        break
      }
      namespace = namespace.body
    }
  }

  private checkDocs(group: ApiGroup): void {
    const valid = this.allowDocs(group.nodes).some(range =>
      hasDescription(normalizeDoc(this.source.slice(range.pos + 3, range.end - 2)), group.name)
    )
    if (!valid) {
      this.report(
        group.nodes[0].getStart(this.file),
        'exported API ' + (group.name ?? '<default>')
          + ' needs JSDoc beginning with its name and a description',
      )
    }
  }

  private allowShapeDocs(node: TypeScript.Node): void {
    if (isPrivateApiMember(node) || isImplementationNode(node)) {
      return
    }
    this.allowDocs([node])
    this.allowInlineMemberDocs(node)
    TypeScript.forEachChild(node, child => this.allowShapeDocs(child))
  }

  private allowInlineMemberDocs(node: TypeScript.Node): void {
    if (!isApiMember(node)) {
      return
    }
    // Inline member docs are trailing trivia after the preceding brace or separator.
    for (const range of TypeScript.getTrailingCommentRanges(this.source, node.getFullStart()) ?? []) {
      if (range.end <= node.getStart(this.file) && this.source.startsWith('/**', range.pos)) {
        this.publicDocs.add(range.pos)
      }
    }
  }

  private checkComments(): void {
    for (const range of this.comments.values()) {
      this.checkComment(range)
    }
  }

  private checkComment(range: TypeScript.CommentRange): void {
    if (range.kind !== TypeScript.SyntaxKind.MultiLineCommentTrivia) {
      return
    }
    if (!this.source.startsWith('/**', range.pos)) {
      this.report(range.pos, 'use // lines instead of non-JSDoc block comments')
    } else if (!this.publicDocs.has(range.pos)) {
      this.report(range.pos, 'private JSDoc is not allowed; use // lines')
    } else if (!hasValidDocLayout(this.source, range)) {
      this.report(
        range.pos,
        'multiline JSDoc needs opening-line text, aligned *  continuation lines, and */ after the last text',
      )
    }
  }

  private report(position: number, message: string): void {
    this.issues.push(
      this.filename + ':' + (this.file.getLineAndCharacterOfPosition(position).line + 1) + ': ' + message,
    )
  }

  private allowDocs(nodes: readonly TypeScript.Node[]): TypeScript.CommentRange[] {
    const ranges = docs(this.source, nodes)
    for (const range of ranges) {
      this.publicDocs.add(range.pos)
    }
    return ranges
  }
}

function isFunctionProperty(node: TypeScript.Node): boolean {
  if (!TypeScript.isPropertyAssignment(node)) {
    return false
  }
  let value = node.initializer
  while (isExpressionWrapper(value)) {
    value = value.expression
  }
  return TypeScript.isArrowFunction(value) || TypeScript.isFunctionExpression(value)
}

function isExpressionWrapper(node: TypeScript.Expression): node is
  | TypeScript.ParenthesizedExpression
  | TypeScript.AsExpression
  | TypeScript.SatisfiesExpression
  | TypeScript.NonNullExpression
{
  return TypeScript.isParenthesizedExpression(node) || TypeScript.isAsExpression(node)
    || TypeScript.isSatisfiesExpression(node) || TypeScript.isNonNullExpression(node)
}

function docs(source: string, nodes: readonly TypeScript.Node[]): TypeScript.CommentRange[] {
  const ranges = new Map<number, TypeScript.CommentRange>()
  for (const node of nodes) {
    for (const range of TypeScript.getLeadingCommentRanges(source, node.getFullStart()) ?? []) {
      if (source.startsWith('/**', range.pos)) {
        ranges.set(range.pos, range)
      }
    }
  }
  return [...ranges.values()]
}

function functionBodyLineCount(
  body: TypeScript.ConciseBody,
  source: string,
  file: TypeScript.SourceFile,
): number {
  const first = file.getLineAndCharacterOfPosition(body.getStart(file)).line
  const last = file.getLineAndCharacterOfPosition(body.getEnd() - 1).line
  const lineStarts = file.getLineStarts()
  let count = 0
  for (let index = first; index <= last; index++) {
    if (TypeScript.isBlock(body) && isBraceOnlyLine(body, source, lineStarts, index, first, last)) {
      continue
    }
    count++
  }
  return count
}

function functionBody(node: TypeScript.Node): TypeScript.ConciseBody | undefined {
  if (
    TypeScript.isFunctionDeclaration(node) || TypeScript.isFunctionExpression(node)
    || TypeScript.isArrowFunction(node) || TypeScript.isMethodDeclaration(node)
    || TypeScript.isConstructorDeclaration(node) || TypeScript.isGetAccessorDeclaration(node)
    || TypeScript.isSetAccessorDeclaration(node)
  ) {
    return node.body
  }
}

function isBraceOnlyLine(
  body: TypeScript.Block,
  source: string,
  lineStarts: readonly number[],
  index: number,
  first: number,
  last: number,
): boolean {
  if (index === first && index === last) {
    return source.slice(body.getStart() + 1, body.getEnd() - 1).trim() === ''
  }
  const lineStart = lineStarts[index]
  const lineEnd = lineStarts[index + 1] ?? source.length
  if (index === first) {
    return source.slice(body.getStart() + 1, lineEnd).trim() === ''
  }
  return index === last && source.slice(lineStart, body.getEnd() - 1).trim() === ''
}

function platformAccessIssue(node: TypeScript.Node, filename: string): string | undefined {
  if (filename.replaceAll('\\', '/').startsWith('ts/shared/shared-src/os/')) {
    return
  }
  if (isBuiltinReference(node)) {
    return 'runtime builtin imports belong in @shared/os'
  }
  if (isPlatformGlobal(node) && !isUniversalTimeAccess(node, filename)) {
    return 'platform globals belong in @shared/os; use its named APIs'
  }
}

function isUniversalTimeAccess(node: TypeScript.Node, filename: string): boolean {
  if (filename.replaceAll('\\', '/') !== 'ts/shared/shared-src/universal/Time.ts') {
    return false
  }
  return isWallClockAccess(node)
    || (TypeScript.isIdentifier(node) && (node.text === 'performance' || node.text === 'setTimeout'))
}

function isBuiltinReference(node: TypeScript.Node): boolean {
  if (!TypeScript.isStringLiteral(node) || !Platform.isPlatformImport(node.text)) {
    return false
  }
  const parent = node.parent
  return TypeScript.isImportDeclaration(parent) || TypeScript.isExportDeclaration(parent)
    || isRuntimeImportCall(parent) || isImportTypeArgument(parent)
}

function isRuntimeImportCall(node: TypeScript.Node): boolean {
  if (!TypeScript.isCallExpression(node)) {
    return false
  }
  return node.expression.kind === TypeScript.SyntaxKind.ImportKeyword
    || (TypeScript.isIdentifier(node.expression) && node.expression.text === 'require')
}

function isImportTypeArgument(node: TypeScript.Node): boolean {
  return TypeScript.isLiteralTypeNode(node) && TypeScript.isImportTypeNode(node.parent)
}

function isPlatformGlobal(node: TypeScript.Node): boolean {
  if (isGlobalPropertyAccess(node) || isWallClockAccess(node)) {
    return true
  }
  if (!TypeScript.isIdentifier(node) || !platformGlobals.has(node.text)) {
    return false
  }
  return !isPropertyName(node)
}

function isWallClockAccess(node: TypeScript.Node): boolean {
  if (TypeScript.isPropertyAccessExpression(node) || TypeScript.isElementAccessExpression(node)) {
    return isDateReference(node.expression) && memberName(node) === 'now'
  }
  if (TypeScript.isNewExpression(node)) {
    return isDateReference(node.expression) && !node.arguments?.length
  }
  return TypeScript.isCallExpression(node) && isDateReference(node.expression)
}

function isDateReference(node: TypeScript.Node): boolean {
  if (TypeScript.isIdentifier(node)) {
    return node.text === 'Date'
  }
  return isGlobalMember(node, 'Date')
}

function isPropertyName(node: TypeScript.Identifier): boolean {
  const parent = node.parent
  if (TypeScript.isPropertyAccessExpression(parent)) {
    return parent.name === node
  }
  if (
    TypeScript.isPropertyAssignment(parent) || TypeScript.isPropertySignature(parent)
    || TypeScript.isPropertyDeclaration(parent) || TypeScript.isMethodSignature(parent)
    || TypeScript.isMethodDeclaration(parent) || TypeScript.isGetAccessorDeclaration(parent)
    || TypeScript.isSetAccessorDeclaration(parent) || TypeScript.isEnumMember(parent)
  ) {
    return parent.name === node
  }
  return TypeScript.isBindingElement(parent) && parent.propertyName === node
}

function isGlobalPropertyAccess(node: TypeScript.Node): boolean {
  if (!TypeScript.isPropertyAccessExpression(node) && !TypeScript.isElementAccessExpression(node)) {
    return false
  }
  const name = memberName(node)
  return name !== undefined && platformGlobals.has(name) && isGlobalMember(node, name)
}

function isGlobalMember(node: TypeScript.Node, name: string): boolean {
  if (!TypeScript.isPropertyAccessExpression(node) && !TypeScript.isElementAccessExpression(node)) {
    return false
  }
  return TypeScript.isIdentifier(node.expression) && node.expression.text === 'globalThis'
    && memberName(node) === name
}

function memberName(
  node: TypeScript.PropertyAccessExpression | TypeScript.ElementAccessExpression,
): string | undefined {
  if (TypeScript.isPropertyAccessExpression(node)) {
    return node.name.text
  }
  if (TypeScript.isElementAccessExpression(node)) {
    return TypeScript.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined
  }
}

const platformGlobals = new Set([
  'process',
  'Bun',
  'Buffer',
  'Deno',
  'crypto',
  'performance',
  'fetch',
  'WebSocket',
  'Worker',
  'Response',
  'Request',
  'Headers',
  'ReadableStream',
  'WritableStream',
  'console',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
])

function hasValidDocLayout(source: string, range: TypeScript.CommentRange): boolean {
  const lines = source.slice(range.pos, range.end).split(/\r\n|\r|\n/)
  if (lines.length === 1) {
    return true
  }
  const indentation = source.slice(source.lastIndexOf('\n', range.pos) + 1, range.pos).match(/^[\t ]*/)![0]
  const prefix = indentation + ' *  '
  return /^\/\*\* \S+ \S/.test(lines[0]) && /\S \*\/$/.test(lines[lines.length - 1])
    && lines.slice(1).every(line => line.startsWith(prefix) && /^\S/.test(line.slice(prefix.length)))
}

function multilineStringIssue(node: TypeScript.Node, file: TypeScript.SourceFile): string | undefined {
  if (!isRuntimeString(node)) {
    return
  }
  const layout = stringLayout(node, file)
  if (!/[\r\n]/.test(layout)) {
    return
  }
  if (!isSTemplate(node)) {
    return 'multiline strings must use S from @shared'
  }
  const lines = layout.split(/\r?\n/)
  const opening =
    file.text.slice(file.text.lastIndexOf('\n', node.getStart(file)) + 1, node.getStart(file)).match(/^[\t ]*/)![0]
  const closing = lines[lines.length - 1]
  if (invalidSLayout(lines, opening, closing)) {
    return 'S content must start on a new line, be indented, and end with an aligned closing delimiter'
  }
}

function isRuntimeString(node: TypeScript.Node): node is TypeScript.StringLiteralLike | TypeScript.TemplateExpression {
  return (TypeScript.isStringLiteralLike(node) || TypeScript.isTemplateExpression(node))
    && !TypeScript.isLiteralTypeNode(node.parent)
}

function isSTemplate(node: TypeScript.Node): boolean {
  return TypeScript.isTaggedTemplateExpression(node.parent) && TypeScript.isIdentifier(node.parent.tag)
    && node.parent.tag.text === 'S'
}

function invalidSLayout(lines: string[], opening: string, closing: string): boolean {
  return lines[0] !== '`' || closing !== opening + '`'
    || lines.slice(1, -1).some(line => line.trim() && !line.startsWith(opening + '  '))
}

function stringLayout(
  node: TypeScript.StringLiteralLike | TypeScript.TemplateExpression,
  file: TypeScript.SourceFile,
): string {
  let layout = node.getText(file)
  if (!TypeScript.isTemplateExpression(node)) {
    return layout
  }
  const ranges: { start: number; end: number }[] = []
  let previous: TypeScript.TemplateHead | TypeScript.TemplateMiddle = node.head
  for (const span of node.templateSpans) {
    ranges.push({
      start: previous.end - 2 - node.getStart(file),
      end: span.literal.getStart(file) + 1 - node.getStart(file),
    })
    if (TypeScript.isTemplateMiddle(span.literal)) {
      previous = span.literal
    }
  }
  for (const range of ranges.reverse()) {
    layout = layout.slice(0, range.start) + 'x' + layout.slice(range.end)
  }
  return layout
}

function isPrivateApiMember(node: TypeScript.Node): boolean {
  if (
    TypeScript.canHaveModifiers(node)
    && TypeScript.getModifiers(node)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.PrivateKeyword)
  ) {
    return true
  }
  return hasPrivateName(node)
}

function hasPrivateName(node: TypeScript.Node): boolean {
  return (TypeScript.isPropertyDeclaration(node) || TypeScript.isMethodDeclaration(node)
    || TypeScript.isGetAccessorDeclaration(node) || TypeScript.isSetAccessorDeclaration(node))
    && TypeScript.isPrivateIdentifier(node.name)
}

function isApiMember(node: TypeScript.Node): boolean {
  return TypeScript.isTypeElement(node) || TypeScript.isClassElement(node) || TypeScript.isParameter(node)
}

function bindingNames(name: TypeScript.BindingName): TypeScript.Identifier[] {
  if (TypeScript.isIdentifier(name)) {
    return [name]
  }
  return name.elements.flatMap(element => TypeScript.isBindingElement(element) ? bindingNames(element.name) : [])
}

function isAmbientNamespace(node: TypeScript.Node): boolean {
  let current: TypeScript.Node | undefined = node
  while (current) {
    if (TypeScript.isSourceFile(current)) {
      return current.isDeclarationFile
    }
    if (
      TypeScript.canHaveModifiers(current)
      && TypeScript.getModifiers(current)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.DeclareKeyword)
    ) {
      return true
    }
    current = current.parent
  }
  return false
}

function isImplementationNode(node: TypeScript.Node): boolean {
  return TypeScript.isBlock(node) || TypeScript.isModuleBlock(node) || TypeScript.isClassStaticBlockDeclaration(node)
    || (TypeScript.isExpression(node) && !isPublicShapeExpression(node))
}

function isPublicShapeExpression(node: TypeScript.Node): boolean {
  return TypeScript.isObjectLiteralExpression(node) || TypeScript.isArrowFunction(node)
    || TypeScript.isFunctionExpression(node)
}

function isApiDeclaration(
  node: TypeScript.Node,
): node is
  | TypeScript.FunctionDeclaration
  | TypeScript.ClassDeclaration
  | TypeScript.InterfaceDeclaration
  | TypeScript.TypeAliasDeclaration
  | TypeScript.EnumDeclaration
  | TypeScript.ModuleDeclaration
{
  return TypeScript.isFunctionDeclaration(node) || TypeScript.isClassDeclaration(node)
    || TypeScript.isInterfaceDeclaration(node)
    || TypeScript.isTypeAliasDeclaration(node) || TypeScript.isEnumDeclaration(node)
    || TypeScript.isModuleDeclaration(node)
}

function isExported(node: TypeScript.Node): boolean {
  return TypeScript.canHaveModifiers(node)
    && TypeScript.getModifiers(node)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.ExportKeyword) === true
}

function isLocalNamedExport(node: TypeScript.ExportDeclaration): node is TypeScript.ExportDeclaration & {
  exportClause: TypeScript.NamedExports
} {
  return !node.moduleSpecifier && node.exportClause !== undefined && TypeScript.isNamedExports(node.exportClause)
}

function isTryPrimitive(filename: string): boolean {
  return filename.replaceAll('\\', '/').replace(/^\.\//, '') === 'ts/shared/shared-src/universal/TryCatch.ts'
}

function normalizeDoc(text: string): string {
  return text.replace(/^\s*\* ?/gm, '').trim().split(/\s+/).join(' ')
}

function hasDescription(text: string, name?: string): boolean {
  if (name === undefined) {
    return /^\S+\s+\S+/.test(text)
  }
  if (!text.startsWith(name)) {
    return false
  }
  const next = text[name.length]
  return next !== undefined && !/[\w$]/.test(next) && text.slice(name.length).trim().length > 1
}
