import { NewlineCharacter, Regxs } from '@shared'
import { TypeScript } from '@tao/shared/typescript'

/** SourceDiagnostic describes a source policy finding and its optional line. */
export type SourceDiagnostic = { file: string; line?: number; message: string }

/** sourceSizeDiagnostic enforces the hard line limit on handwritten TypeScript. */
export function sourceSizeDiagnostic(file: string, source: string): SourceDiagnostic | undefined {
  if (isExcludedSource(file, source)) {
    return
  }
  const lines = source === '' ? 0 : source.split(NewlineCharacter).length - Number(source.endsWith(NewlineCharacter))
  if (lines > 350) {
    return { file, message: `handwritten TypeScript files must contain at most 350 lines; found ${lines}` }
  }
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
