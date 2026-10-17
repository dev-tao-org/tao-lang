import { Time, Try } from '@shared'
import * as TypeScript from 'typescript'
import { IO } from './cli-kit'

/** exportedFunctionCommentIssues finds exported functions without name-led prose comments. */
export function exportedFunctionCommentIssues(filename: string, source: string): string[] {
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  const issues: string[] = []
  const scopes: Array<TypeScript.SourceFile | TypeScript.ModuleBlock> = []
  const visit = (node: TypeScript.Node): void => {
    if (TypeScript.isSourceFile(node) || TypeScript.isModuleBlock(node)) {
      scopes.push(node)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)

  for (const scope of scopes) {
    const functions = new Map<string, TypeScript.FunctionDeclaration[]>()
    const values = new Map<
      string,
      { declaration: TypeScript.VariableDeclaration; statement: TypeScript.VariableStatement }
    >()
    for (const statement of scope.statements) {
      if (TypeScript.isFunctionDeclaration(statement) && statement.name) {
        const group = functions.get(statement.name.text) ?? []
        group.push(statement)
        functions.set(statement.name.text, group)
      }
      if (TypeScript.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (TypeScript.isIdentifier(declaration.name) && isFunctionValue(declaration.initializer)) {
            values.set(declaration.name.text, { declaration, statement })
          }
        }
      }
    }

    const checkGroup = (name: string, declarations: TypeScript.Node[], extras: TypeScript.Node[] = []): void => {
      const docs = declarations.flatMap(documentation).concat(extras.flatMap(documentation))
      const valid = docs.some(text => startsWithDescription(text, name))
      if (!valid) {
        const line = lineOf(file, declarations[0])
        issues.push(
          `${filename}:${line}: exported function ${name} needs JSDoc beginning with its name and a description`,
        )
      }
    }

    for (const [name, group] of functions) {
      const exported = group.filter(isExported)
      if (exported.length > 0) {
        checkGroup(name, exported)
      }
    }
    for (const statement of scope.statements) {
      if (TypeScript.isVariableStatement(statement) && isExported(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (TypeScript.isIdentifier(declaration.name) && isFunctionValue(declaration.initializer)) {
            checkGroup(declaration.name.text, [declaration, statement, declaration.initializer])
          }
        }
      }
      if (isLocalNamedExport(statement)) {
        for (const specifier of statement.exportClause.elements) {
          const name = specifier.propertyName?.text ?? specifier.name.text
          const group = functions.get(name) ?? []
          if (group.length > 0) {
            checkGroup(name, group)
          } else if (values.has(name)) {
            const value = values.get(name)!
            checkGroup(name, [value.declaration, value.statement])
          }
        }
      }
      if (TypeScript.isExportAssignment(statement) && !statement.isExportEquals) {
        if (TypeScript.isIdentifier(statement.expression)) {
          const name = statement.expression.text
          const group = functions.get(name) ?? []
          const value = values.get(name)
          if (group.length > 0) {
            checkGroup(name, group, [statement])
          } else if (value) {
            checkGroup(name, [value.declaration, value.statement, statement])
          }
        } else if (isFunctionValue(statement.expression)) {
          if (!documentation(statement).concat(documentation(statement.expression)).some(text => text.length > 0)) {
            issues.push(`${filename}:${lineOf(file, statement)}: default exported function needs JSDoc`)
          }
        }
      }
      if (isAnonymousExportedFunction(statement)) {
        if (!documentation(statement).some(text => text.length > 0)) {
          issues.push(`${filename}:${lineOf(file, statement)}: default exported function needs JSDoc`)
        }
      }
    }
  }
  return issues
}

/** checkExportedFunctionComments scans TypeScript sources under a repository root. */
export async function checkExportedFunctionComments(root: string): Promise<number> {
  const started = Time.nowMs()
  const issues: string[] = []
  const result = await Try(async () => {
    for (
      const filename of TypeScript.sys.readDirectory(`${root}/ts`, ['.ts', '.tsx'], ['**/node_modules/**', '**/*.d.ts'])
    ) {
      issues.push(...exportedFunctionCommentIssues(filename, await Bun.file(filename).text()))
    }
    return 0
  }, {
    catch: error => {
      IO.error(`Could not check exported function comments: ${String(error)}`)
      return 1
    },
  })
  for (const issue of issues) {
    IO.error(issue)
  }
  IO.info(`Checked exported function comments: ${issues.length} issue(s) in ${Math.round(Time.nowMs() - started)}ms`)
  return result === 0 && issues.length === 0 ? 0 : 1
}

function isLocalNamedExport(node: TypeScript.Node): node is TypeScript.ExportDeclaration & {
  exportClause: TypeScript.NamedExports
} {
  return TypeScript.isExportDeclaration(node) && !node.moduleSpecifier
    && node.exportClause !== undefined && TypeScript.isNamedExports(node.exportClause)
}

function isAnonymousExportedFunction(node: TypeScript.Node): boolean {
  return TypeScript.isFunctionDeclaration(node) && !node.name && isExported(node)
}

function isExported(node: TypeScript.Node): boolean {
  return TypeScript.canHaveModifiers(node)
    && TypeScript.getModifiers(node)?.some(modifier => modifier.kind === TypeScript.SyntaxKind.ExportKeyword) === true
}

function isFunctionValue(
  node: TypeScript.Expression | undefined,
): node is TypeScript.ArrowFunction | TypeScript.FunctionExpression {
  return node !== undefined && (TypeScript.isArrowFunction(node) || TypeScript.isFunctionExpression(node))
}

function documentation(node: TypeScript.Node): string[] {
  const source = node.getSourceFile().text
  const comments = TypeScript.getLeadingCommentRanges(source, node.getFullStart()) ?? []
  return comments.filter(comment => source.slice(comment.pos, comment.end).startsWith('/**'))
    .map(comment =>
      source.slice(comment.pos + 3, comment.end - 2)
        .replace(/^\s*\* ?/gm, '').split('\n').map(line => line.trim()).filter(Boolean).join(' ')
    )
}

function startsWithDescription(text: string, name: string): boolean {
  if (!text.startsWith(name)) {
    return false
  }
  const next = text[name.length]
  return next !== undefined && !/[\w$]/.test(next) && text.slice(name.length).trim().length > 1
}

function lineOf(file: TypeScript.SourceFile, node: TypeScript.Node): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
}
