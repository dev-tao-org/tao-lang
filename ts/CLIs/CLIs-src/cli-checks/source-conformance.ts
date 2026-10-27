import { Errors, Time } from '@shared'
import { Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { IO } from '../cli-kit/cli-kit'
import { sourceBridgeEmissionIssues } from './source-bridge-emissions'
import { platformGlobalIssue } from './source-bridge-globals'
import { createSourceBridgeContext } from './source-bridge-owners'
import { sourceBridgeIssue, sourceBridgeLoaderAliases } from './source-bridges'
import { hasValidDocLayout, isAmbientNamespace } from './source-conformance-api'
import { nestedConditionalIssue } from './source-conformance-conditional'
import { ExportedApiChecker } from './source-conformance-exports'
import { objectFunctionStyleIssue } from './source-conformance-functions'
import * as ConformanceLayout from './source-conformance-layout'
import { optionalAccessIssue } from './source-conformance-optional'
import { conformanceSources, createConformanceProgram } from './source-conformance-program'
import { complexSignatureTypeIssue } from './source-conformance-signatures'
import { isExcludedSource, sourceSizeDiagnostics } from './source-size'

/** checkSourceConformance checks new TypeScript syntax and type-aware source rules without running tests. */
export async function checkSourceConformance(root: string): Promise<void> {
  const started = Time.nowMs()
  const issues: string[] = []
  const sources = await conformanceSources(root)
  const bridgeContext = createSourceBridgeContext(root)
  const program = createConformanceProgram(root, sources)
  const checker = program.getTypeChecker()
  for (const filename of sources) {
    const relative = Path.relative(root, filename).replaceAll('\\', '/')
    const file = program.getSourceFile(filename) ?? Errors.ThrowShouldNeverHappen(`Missing checked source: ${filename}`)
    const { error } = sourceSizeDiagnostics(relative, file.text)
    issues.push(
      ...error ? [error] : [],
      ...new SourceConformanceChecker(relative, file, checker, bridgeContext).check(),
    )
  }
  IO.print('Checked source conformance: ' + issues.length + ' issue(s) in ' + Math.round(Time.nowMs() - started) + 'ms')
  if (issues.length > 0) {
    Errors.ThrowUserInput(issues.join('\n'))
  }
}

class SourceConformanceChecker {
  private readonly source: string
  private readonly excludedSource: boolean
  private readonly loaderAliases: ReadonlySet<string>
  private readonly issues: string[] = []
  private readonly publicDocs = new Set<number>()
  private readonly comments = new Map<number, TypeScript.CommentRange>()
  private readonly api: ExportedApiChecker

  constructor(
    private readonly filename: string,
    private readonly file: TypeScript.SourceFile,
    private readonly checker: TypeScript.TypeChecker,
    private readonly bridgeContext: ReturnType<typeof createSourceBridgeContext>,
  ) {
    this.source = file.text
    this.excludedSource = isExcludedSource(filename, this.source)
    this.loaderAliases = sourceBridgeLoaderAliases(file)
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
    if (TypeScript.isImportDeclaration(node) && !this.excludedSource) {
      this.reportIssue(node, ConformanceLayout.singleLineImportIssue(node, this.file))
    }
    this.reportIssue(node, optionalAccessIssue(node, this.checker))
    this.reportIssue(node, objectFunctionStyleIssue(node, this.source))
    this.reportIssue(node, nestedConditionalIssue(node))
    this.reportIssue(node, complexSignatureTypeIssue(node))
    this.checkExternalBoundaries(node)
    this.checkStructure(node)
  }

  private checkExternalBoundaries(node: TypeScript.Node): void {
    this.reportIssue(node, platformGlobalIssue(node, this.filename, this.checker, this.excludedSource))
    const bridgeIssue = sourceBridgeIssue(
      node,
      this.filename,
      this.bridgeContext,
      this.loaderAliases,
      this.excludedSource,
    )
    this.reportIssue(node, bridgeIssue)
    if (!this.excludedSource) {
      for (const issue of sourceBridgeEmissionIssues(node, this.filename, this.bridgeContext)) {
        this.report(node.getStart(this.file), issue)
      }
    }
  }

  private reportIssue(node: TypeScript.Node, issue: string | undefined): void {
    if (issue) {
      this.report(node.getStart(this.file), issue)
    }
  }

  private checkStructure(node: TypeScript.Node): void {
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
  return filename.replaceAll('\\', '/').replace(/^\.\//, '') === 'ts/shared/shared-src/universal/TryCatch.ts'
}
