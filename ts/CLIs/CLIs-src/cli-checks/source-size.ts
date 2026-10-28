import { Regxs } from '@shared'
import * as TypeScript from 'typescript'

/** sourceSizeDiagnostics enforces the hard line limit on handwritten TypeScript. */
export function sourceSizeDiagnostics(filename: string, source: string): { error?: string } {
  if (isExcludedSource(filename, source)) {
    return {}
  }
  const lines = source === '' ? 0 : source.split('\n').length - Number(source.endsWith('\n'))
  if (lines > 350) {
    return { error: `${filename}: handwritten TypeScript files must contain at most 350 lines; found ${lines}` }
  }
  return {}
}

/** isExcludedSource identifies generated, external and third-party source files. */
export function isExcludedSource(filename: string, source: string): boolean {
  const path = filename.replaceAll('\\', '/')
  return isExternalPath(path) || hasExternalProvenance(source)
}

function isExternalPath(path: string): boolean {
  return Regxs.ExternalSourcePath.test(path) || Regxs.GeneratedSourceSuffix.test(path)
}

function hasExternalProvenance(source: string): boolean {
  // Whole-file imports identify their source with @third-party; generators use @generated.
  const comments = TypeScript.getLeadingCommentRanges(source, 0) ?? []
  return comments.some(comment => Regxs.ExternalSourceProvenance.test(source.slice(comment.pos, comment.end)))
}
