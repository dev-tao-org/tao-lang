import * as TypeScript from 'typescript'

/** sourceSizeDiagnostics applies the soft and hard line limits to handwritten TypeScript. */
export function sourceSizeDiagnostics(filename: string, source: string): { warning?: string; error?: string } {
  if (isExcludedSource(filename, source)) {
    return {}
  }
  const lines = source === '' ? 0 : source.split('\n').length - Number(source.endsWith('\n'))
  if (lines > 350) {
    return { error: `${filename}: handwritten TypeScript files must contain at most 350 lines; found ${lines}` }
  }
  if (lines > 250) {
    return { warning: `${filename}: handwritten TypeScript file exceeds the 250-line soft limit; found ${lines}` }
  }
  return {}
}

function isExcludedSource(filename: string, source: string): boolean {
  const path = filename.replaceAll('\\', '/')
  return isExternalPath(path) || hasExternalProvenance(source)
}

function isExternalPath(path: string): boolean {
  return /(?:^|\/)(?:node_modules|_gen_[^/]*|generated|vendor|third-party)(?:\/|$)/u.test(path)
    || /\.generated\.(?:ts|tsx|mts|cts)$/u.test(path)
}

function hasExternalProvenance(source: string): boolean {
  // Whole-file imports identify their source with @third-party; generators use @generated.
  const comments = TypeScript.getLeadingCommentRanges(source, 0) ?? []
  return comments.some(comment => /@(?:generated|third-party)\b/u.test(source.slice(comment.pos, comment.end)))
}
