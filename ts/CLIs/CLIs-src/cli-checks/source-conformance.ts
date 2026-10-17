import { Errors, Time } from '@shared'
import { FileSystem, Path } from '@shared/os'
import * as TypeScript from 'typescript'
import { IO } from '../cli-kit/cli-kit'
import { hasValidDocLayout, isAmbientNamespace, isFunctionProperty } from './source-conformance-api'
import { ExportedApiChecker } from './source-conformance-exports'
import { functionBody, functionBodyLineCount, multilineStringIssue } from './source-conformance-layout'
import { platformAccessIssue } from './source-conformance-platform'
import { sourceSizeDiagnostics } from './source-size'

/** checkSourceConformance checks new TypeScript sources without running tests or loading a type checker. */
export async function checkSourceConformance(root: string): Promise<void> {
  const started = Time.nowMs()
  const issues: string[] = []
  for (const filename of await FileSystem.sourceFiles(root + '/ts')) {
    const relative = Path.relative(root, filename).replaceAll('\\', '/')
    const source = await FileSystem.file(filename).text()
    issues.push(...sourceConformanceIssues(relative, source))
  }
  IO.print('Checked source conformance: ' + issues.length + ' issue(s) in ' + Math.round(Time.nowMs() - started) + 'ms')
  if (issues.length > 0) {
    Errors.ThrowUserInput(issues.join('\n'))
  }
}

/** sourceConformanceIssues checks repository-relative TypeScript source for API docs and source conventions. */
export function sourceConformanceIssues(filename: string, source: string): string[] {
  const { error } = sourceSizeDiagnostics(filename, source)
  return [...error ? [error] : [], ...new SourceConformanceChecker(filename, source).check()]
}

class SourceConformanceChecker {
  private readonly file: TypeScript.SourceFile
  private readonly issues: string[] = []
  private readonly publicDocs = new Set<number>()
  private readonly comments = new Map<number, TypeScript.CommentRange>()
  private readonly api: ExportedApiChecker

  constructor(private readonly filename: string, private readonly source: string) {
    this.file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
    this.api = new ExportedApiChecker(
      source,
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
      this.api.checkScope(node)
    }
    if (TypeScript.isModuleBlock(node) && this.api.publicNamespaces.has(node.parent)) {
      this.api.checkScope(node, isAmbientNamespace(node))
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
}

function isTryPrimitive(filename: string): boolean {
  return filename.replaceAll('\\', '/').replace(/^\.\//, '') === 'ts/shared/shared-src/universal/TryCatch.ts'
}
