import { Errors, Regxs, Time } from '@shared'
import { Path } from '@shared/os'
import * as TypeScript from 'typescript'
import { IO } from '../cli-kit/cli-kit'
import { hasValidDocLayout, isAmbientNamespace } from './source-conformance-api'
import { nestedConditionalIssue, selectedFunctionCallIssue } from './source-conformance-conditional'
import { ExportedApiChecker } from './source-conformance-exports'
import { objectFunctionStyleIssue } from './source-conformance-functions'
import * as ConformanceLayout from './source-conformance-layout'
import { booleanExpressionIssue, namedRegexIssue, unnamedUnionIssue } from './source-conformance-naming'
import { optionalAccessIssue } from './source-conformance-optional'
import { platformAccessIssue } from './source-conformance-platform'
import { conformanceSources, createConformanceProgram } from './source-conformance-program'
import { complexSignatureTypeIssue } from './source-conformance-signatures'
import { analyzeSignatureTypeOrder } from './source-conformance-type-order'
import { isExcludedSource, sourceSizeDiagnostics } from './source-size'

/** checkSourceConformance checks new TypeScript syntax and type-aware source rules without running tests. */
export async function checkSourceConformance(root: string): Promise<void> {
  const started = Time.nowMs()
  const issues: string[] = []
  const sources = await conformanceSources(root)
  const program = createConformanceProgram(root, sources)
  const checker = program.getTypeChecker()
  const typeOrder = analyzeSignatureTypeOrder(program)
  for (const filename of sources) {
    const relative = Path.relative(root, filename).replaceAll('\\', '/')
    const file = program.getSourceFile(filename) ?? Errors.ThrowShouldNeverHappen(`Missing checked source: ${filename}`)
    const { error } = sourceSizeDiagnostics(relative, file.text)
    for (const change of typeOrder.get(file) ?? []) {
      if (change.newText === '') {
        const line = file.getLineAndCharacterOfPosition(change.span.start).line + 1
        issues.push(`${relative}:${line}: put a single-consumer signature type before its owning function`)
      }
    }
    issues.push(...error ? [error] : [], ...new SourceConformanceChecker(relative, file, checker).check())
  }
  IO.print('Checked source conformance: ' + issues.length + ' issue(s) in ' + Math.round(Time.nowMs() - started) + 'ms')
  if (issues.length > 0) {
    Errors.ThrowUserInput(issues.join('\n'))
  }
}

type ConformanceIssue = string | undefined

class SourceConformanceChecker {
  private readonly source: string
  private readonly excluded: boolean
  private readonly issues: string[] = []
  private readonly publicDocs = new Set<number>()
  private readonly comments = new Map<number, TypeScript.CommentRange>()
  private readonly api: ExportedApiChecker

  constructor(
    private readonly filename: string,
    private readonly file: TypeScript.SourceFile,
    private readonly checker: TypeScript.TypeChecker,
  ) {
    this.source = file.text
    this.excluded = isExcludedSource(filename, this.source)
    this.api = new ExportedApiChecker(
      this.source,
      this.file,
      this.publicDocs,
      (position, message) => this.report(position, message),
    )
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
    if (TypeScript.isImportDeclaration(node) && !this.excluded) {
      const importIssue = ConformanceLayout.singleLineImportIssue(node, this.file)
      if (importIssue) {
        this.report(node.getStart(this.file), importIssue)
      }
    }
    this.reportIssue(node, optionalAccessIssue(node, this.checker))
    this.reportIssue(node, objectFunctionStyleIssue(node, this.source))
    this.reportIssue(node, nestedConditionalIssue(node))
    this.reportIssue(node, selectedFunctionCallIssue(node))
    this.reportIssue(node, complexSignatureTypeIssue(node))
    this.reportIssue(node, platformAccessIssue(node, this.filename))
    if (!this.excluded) {
      this.reportIssue(node, booleanExpressionIssue(node))
      this.reportIssue(node, unnamedUnionIssue(node))
      this.reportIssue(node, namedRegexIssue(node))
    }
    const body = ConformanceLayout.functionBody(node)
    if (body) {
      this.checkFunctionBody(body)
    }
    if (TypeScript.isSourceFile(node)) {
      this.api.checkScope(node)
    }
    if (TypeScript.isModuleBlock(node) && this.api.publicNamespaces.has(node.parent)) {
      this.api.checkScope(node, isAmbientNamespace(node))
    }
    if (TypeScript.isTryStatement(node) && !isTryPrimitive(this.filename)) {
      this.report(node.getStart(this.file), 'use Try from @shared instead of native try/catch/finally')
    }
    const stringIssue = ConformanceLayout.multilineStringIssue(node, this.file)
    if (stringIssue) {
      this.report(node.getStart(this.file), stringIssue)
    }
  }

  private reportIssue(node: TypeScript.Node, issue: ConformanceIssue): void {
    if (issue) {
      this.report(node.getStart(this.file), issue)
    }
  }

  private checkFunctionBody(body: TypeScript.ConciseBody): void {
    const lines = ConformanceLayout.functionBodyLineCount(body, this.source, this.file)
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
    } else {
      // Properly formatted public JSDoc needs no diagnostic.
    }
  }

  private report(position: number, message: string): void {
    this.issues.push(
      this.filename + ':' + (this.file.getLineAndCharacterOfPosition(position).line + 1) + ': ' + message,
    )
  }
}

function isTryPrimitive(filename: string): boolean {
  return filename.replaceAll('\\', '/').replace(Regxs.RelativePathPrefix, '')
    === 'ts/shared/shared-src/universal/TryCatch.ts'
}
