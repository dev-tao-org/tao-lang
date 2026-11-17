import { Errors, Regxs } from '@shared'
import { Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { readTestOnlyUsageReport, type TestOnlyUsageReport } from '../Workspace/TestOnlyUsageReport'
import { sourceBridgeEmissionIssues } from './source-bridge-emissions'
import { platformGlobalIssue } from './source-bridge-globals'
import { createSourceBridgeContext, type SourceBridgeContext } from './source-bridge-owners'
import * as Bridges from './source-bridges'
import { hasValidDocLayout, isAmbientNamespace } from './source-conformance-api'
import { arrayMultilineStringIssue } from './source-conformance-array-strings'
import { getSingleLineCallChanges } from './source-conformance-call-layout'
import { nestedConditionalIssue, selectedFunctionCallIssue } from './source-conformance-conditional'
import { analyzeConstantOrder } from './source-conformance-constant-order'
import { ExportedApiChecker } from './source-conformance-exports'
import { objectFunctionStyleIssue } from './source-conformance-functions'
import { rawJsonIssue } from './source-conformance-json'
import * as ConformanceLayout from './source-conformance-layout'
import * as ConformanceNaming from './source-conformance-naming'
import { objectCopyIssue, objectLiteralKeysIssue } from './source-conformance-object-keys'
import { optionalAccessIssue } from './source-conformance-optional'
import { predicateOperatorIssue } from './source-conformance-predicates'
import * as ConformanceProgram from './source-conformance-program'
import { concreteReturnTypeIssue, ownLineNullishIssue } from './source-conformance-result-contracts'
import { complexSignatureTypeIssue } from './source-conformance-signatures'
import { analyzeSignatureTypeOrder } from './source-conformance-type-order'
import * as Facades from './source-facades'
import { isExcludedSource, type SourceDiagnostic, sourceSizeDiagnostic } from './source-size'

/** SourceConformanceResult contains findings and defers optional usage analysis over the same program. */
export type SourceConformanceResult = {
  findings: readonly SourceDiagnostic[]
  readUsageReport(): Promise<TestOnlyUsageReport>
}

/** analyzeSourceConformance checks new TypeScript syntax and type-aware source rules without running tests. */
export async function analyzeSourceConformance(root: string): Promise<SourceConformanceResult> {
  const findings: SourceDiagnostic[] = []
  const sources = await ConformanceProgram.conformanceSources(root)
  const bridgeContext = createSourceBridgeContext(root)
  const program = ConformanceProgram.createConformanceProgram(root, sources)
  const checker = program.getTypeChecker()
  const facadeContext = Facades.createSourceFacadeContext(root, sources, program.getCompilerOptions())
  const editableSources = ConformanceProgram.getEditableConformanceSources(program, sources)
  const constantOrder = analyzeConstantOrder(program, editableSources)
  const typeOrder = analyzeSignatureTypeOrder(program, editableSources)
  for (const filename of sources) {
    const relative = Path.relative(root, filename).replaceAll('\\', '/')
    const file = program.getSourceFile(filename) ?? Errors.ThrowShouldNeverHappen(`Missing checked source: ${filename}`)
    const size = sourceSizeDiagnostic(relative, file.text)
    const changes = readLayoutDiagnostics(relative, file, constantOrder.get(file) ?? [], typeOrder.get(file) ?? [])
    findings.push(
      ...changes,
      ...size ? [size] : [],
      ...new SourceConformanceChecker(relative, file, checker, bridgeContext, facadeContext).check(),
    )
  }
  return { findings, readUsageReport: () => readTestOnlyUsageReport(root, program, sources) }
}

function readLayoutDiagnostics(
  filename: string,
  file: TypeScript.SourceFile,
  constantChanges: readonly TypeScript.TextChange[],
  typeChanges: readonly TypeScript.TextChange[],
): SourceDiagnostic[] {
  const issues: SourceDiagnostic[] = []
  const report = (change: TypeScript.TextChange, message: string) => {
    issues.push(locateDiagnostic(filename, file, change.span.start, message))
  }
  for (const change of constantChanges) {
    if (change.newText === '') {
      report(change, 'put a single-consumer constant before its module-level owner')
    }
  }
  if (!isExcludedSource(file.fileName, file.text)) {
    for (const change of getSingleLineCallChanges(file)) {
      report(change, 'put fitting calls, single-parameter lists and if headers on one line')
    }
  }
  for (const change of typeChanges) {
    if (change.newText === '') {
      report(change, 'put a single-consumer signature type before its owning function')
    }
  }
  return issues
}

function locateDiagnostic(
  filename: string,
  file: TypeScript.SourceFile,
  position: number,
  message: string,
): SourceDiagnostic {
  const line = file.getLineAndCharacterOfPosition(position).line + 1
  return { file: filename, line, message }
}

type ConformanceIssue = string | undefined

class SourceConformanceChecker {
  private readonly source: string
  private readonly excluded: boolean
  private readonly issues: SourceDiagnostic[] = []
  private readonly publicDocs = new Set<number>()
  private readonly comments = new Map<number, TypeScript.CommentRange>()
  private readonly loaderAliases: Bridges.SourceLoaderAliases
  private readonly api: ExportedApiChecker

  constructor(
    private readonly filename: string,
    private readonly file: TypeScript.SourceFile,
    private readonly checker: TypeScript.TypeChecker,
    private readonly bridgeContext: SourceBridgeContext,
    private readonly facadeContext: Facades.SourceFacadeContext,
  ) {
    this.source = file.text
    this.loaderAliases = Bridges.sourceBridgeLoaderAliases(file, checker)
    this.excluded = isExcludedSource(filename, this.source)
    this.api = new ExportedApiChecker(
      this.source,
      this.file,
      this.publicDocs,
      (position, message) => this.report(position, message),
    )
  }

  check(): SourceDiagnostic[] {
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
    if (!this.excluded) {
      this.reportIssue(node, ConformanceNaming.argumentsIdentifierIssue(node))
      this.reportIssue(node, concreteReturnTypeIssue(node, this.checker))
      this.reportIssue(node, ownLineNullishIssue(node, this.file))
      this.reportIssue(node, arrayMultilineStringIssue(node))
      this.reportIssue(node, objectLiteralKeysIssue(node))
      this.reportIssue(node, objectCopyIssue(node, this.filename))
      this.reportIssue(node, predicateOperatorIssue(node))
      this.reportIssue(node, rawJsonIssue(node, this.filename, this.checker))
    }
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
    this.checkExternalBoundaries(node)
    this.checkStructure(node)
    if (!this.excluded) {
      this.reportIssue(node, ConformanceNaming.booleanExpressionIssue(node))
      this.reportIssue(node, ConformanceNaming.unnamedUnionIssue(node))
      this.reportIssue(node, ConformanceNaming.namedRegexIssue(node))
    }
  }

  private checkExternalBoundaries(node: TypeScript.Node): void {
    this.reportIssue(node, platformGlobalIssue(node, this.filename, this.checker, this.excluded))
    this.reportIssue(
      node,
      Bridges.sourceBridgeIssue(node, this.filename, this.bridgeContext, this.loaderAliases, this.excluded),
    )
    if (!this.excluded) {
      this.reportIssue(node, Facades.sourceFacadeIssue(node, this.facadeContext, this.loaderAliases))
      for (const issue of sourceBridgeEmissionIssues(node, this.filename, this.bridgeContext)) {
        this.reportIssue(node, issue)
      }
    }
  }

  private checkStructure(node: TypeScript.Node): void {
    const body = ConformanceLayout.functionBody(node)
    if (body) {
      this.checkFunctionBody(body)
    }
    if (TypeScript.isSourceFile(node)) {
      this.api.checkScope(node)
      if (!this.excluded) {
        this.reportIssue(node, Facades.sourceFacadeLayoutIssue(node, this.facadeContext))
      }
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
    this.issues.push(locateDiagnostic(this.filename, this.file, position, message))
  }
}

function isTryPrimitive(filename: string): boolean {
  return filename.replaceAll('\\', '/').replace(Regxs.RelativePathPrefix, '')
    === 'ts/shared/shared-src/universal/TryCatch.ts'
}
