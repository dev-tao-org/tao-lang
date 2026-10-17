import { Errors, Time, Try } from '@shared'
import { relative } from 'node:path'
import * as TypeScript from 'typescript'
import { IO } from './cli-kit'

type ApiGroup = { name?: string; nodes: TypeScript.Node[]; exported: boolean }

/** checkSourceConformance checks new TypeScript sources without running tests or loading a type checker. */
export async function checkSourceConformance(root: string): Promise<void> {
  const started = Time.nowMs()
  const issues: string[] = []
  await Try(async () => {
    for (
      const filename of TypeScript.sys.readDirectory(root + '/ts', ['.ts', '.tsx', '.mts', '.cts'], [
        '**/node_modules/**',
      ])
    ) {
      issues.push(
        ...sourceConformanceIssues(relative(root, filename).replaceAll('\\', '/'), await Bun.file(filename).text()),
      )
    }
  }, { catch: error => Errors.ThrowHostEnvironment('Could not check source conformance: ' + Errors.messageOf(error)) })
  IO.info('Checked source conformance: ' + issues.length + ' issue(s) in ' + Math.round(Time.nowMs() - started) + 'ms')
  if (issues.length > 0) {
    Errors.ThrowUserInput(issues.join('\n'))
  }
}

/** sourceConformanceIssues checks repository-relative TypeScript source for API docs and exception/comment syntax. */
export function sourceConformanceIssues(filename: string, source: string): string[] {
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  const issues: string[] = []
  const publicDocs = new Set<number>()
  const publicNamespaces = new Set<TypeScript.Node>()
  const comments = new Map<number, TypeScript.CommentRange>()
  const report = (position: number, message: string): void => {
    issues.push(filename + ':' + (file.getLineAndCharacterOfPosition(position).line + 1) + ': ' + message)
  }
  const allowDocs = (nodes: readonly TypeScript.Node[]): TypeScript.CommentRange[] => {
    const ranges = docs(nodes)
    for (const range of ranges) {
      publicDocs.add(range.pos)
    }
    return ranges
  }
  const docs = (nodes: readonly TypeScript.Node[]): TypeScript.CommentRange[] => {
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
  const visit = (node: TypeScript.Node): void => {
    if (TypeScript.isSourceFile(node)) {
      checkScope(node)
    }
    if (TypeScript.isModuleBlock(node) && publicNamespaces.has(node.parent)) {
      checkScope(node, isAmbientNamespace(node))
    }
    if (TypeScript.isTryStatement(node) && !isTryPrimitive(filename)) {
      report(node.getStart(file), 'use Try from @shared instead of native try/catch/finally')
    }
    const stringIssue = multilineStringIssue(node, file)
    if (stringIssue) {
      report(node.getStart(file), stringIssue)
    }
    // Parser token boundaries keep comment-looking strings, templates and regexes out of the scan.
    for (const range of TypeScript.getLeadingCommentRanges(source, node.getFullStart()) ?? []) {
      comments.set(range.pos, range)
    }
    for (const range of TypeScript.getTrailingCommentRanges(source, node.end) ?? []) {
      comments.set(range.pos, range)
    }
    for (const child of node.getChildren(file)) {
      if (!TypeScript.isJSDoc(child)) {
        visit(child)
      }
    }
  }
  const checkScope = (scope: TypeScript.SourceFile | TypeScript.ModuleBlock, implicitExports = false): void => {
    const groups = new Map<string, ApiGroup>()
    const anonymous: ApiGroup[] = []
    const add = (name: string | undefined, nodes: TypeScript.Node[], exported: boolean): void => {
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
    for (const statement of scope.statements) {
      if (TypeScript.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          for (const name of bindingNames(declaration.name)) {
            add(name.text, [name, declaration, statement], implicitExports || isExported(statement))
          }
        }
      } else if (isApiDeclaration(statement)) {
        add(statement.name?.text, [statement], implicitExports || isExported(statement))
      }
    }
    for (const statement of scope.statements) {
      if (TypeScript.isExportDeclaration(statement)) {
        // Forwarding exports may be documented but do not duplicate the declaration's docs.
        allowDocs([statement])
        if (isLocalNamedExport(statement)) {
          for (const specifier of statement.exportClause.elements) {
            const group = groups.get(specifier.propertyName?.text ?? specifier.name.text)
            if (group) {
              group.exported = true
            }
          }
        }
      } else if (TypeScript.isExportAssignment(statement)) {
        const group = TypeScript.isIdentifier(statement.expression) ? groups.get(statement.expression.text) : undefined
        if (group) {
          group.exported = true
          group.nodes.push(statement)
        } else {
          anonymous.push({ nodes: [statement], exported: true })
        }
      }
    }
    for (const group of [...groups.values(), ...anonymous]) {
      if (!group.exported) {
        continue
      }
      checkDocs(group)
      for (const node of group.nodes) {
        if (TypeScript.isModuleDeclaration(node)) {
          let namespace = node
          while (true) {
            publicNamespaces.add(namespace)
            if (!namespace.body || !TypeScript.isModuleDeclaration(namespace.body)) {
              break
            }
            namespace = namespace.body
          }
        } else {
          allowShapeDocs(node)
        }
      }
    }
  }
  const checkDocs = (group: ApiGroup): void => {
    const valid = allowDocs(group.nodes).some(range =>
      hasDescription(normalizeDoc(source.slice(range.pos + 3, range.end - 2)), group.name)
    )
    if (!valid) {
      report(
        group.nodes[0].getStart(file),
        'exported API ' + (group.name ?? '<default>')
          + ' needs JSDoc beginning with its name and a description',
      )
    }
  }
  const allowShapeDocs = (node: TypeScript.Node): void => {
    if (isPrivateApiMember(node) || isImplementationNode(node)) {
      return
    }
    allowDocs([node])
    if (isApiMember(node)) {
      // Inline member docs are trailing trivia after the preceding brace or separator.
      for (const range of TypeScript.getTrailingCommentRanges(source, node.getFullStart()) ?? []) {
        if (range.end <= node.getStart(file) && source.startsWith('/**', range.pos)) {
          publicDocs.add(range.pos)
        }
      }
    }
    TypeScript.forEachChild(node, allowShapeDocs)
  }
  visit(file)
  for (const range of comments.values()) {
    if (range.kind !== TypeScript.SyntaxKind.MultiLineCommentTrivia) {
      continue
    }
    if (!source.startsWith('/**', range.pos)) {
      report(range.pos, 'use // lines instead of non-JSDoc block comments')
    } else if (!publicDocs.has(range.pos)) {
      report(range.pos, 'private JSDoc is not allowed; use // lines')
    } else if (!hasValidDocLayout(source, range)) {
      report(
        range.pos,
        'multiline JSDoc needs opening-line text, aligned *  continuation lines, and */ after the last text',
      )
    }
  }
  return issues
}

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
