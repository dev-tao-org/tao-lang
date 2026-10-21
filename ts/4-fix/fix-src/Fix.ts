import type * as AST from '@ast-gen/AST'
import type { Tree } from '@grammar/CST'
import { Errors, Timings } from '@shared'
import { organizeImports } from './fix/Imports'
import { applyEdits, type SourceEdit } from './Source'

/** FixInput pairs complete source syntax with its unmodified semantic AST. */
export type FixInput = { source: string; tree: Tree; ast: AST.Document }

/** FixResult proposes source changes without mutating parsed trees or writing to disk. */
export type FixResult = { text: string; edits: readonly SourceEdit[] }

/** fix organizes a complete document before formatting, without requiring name resolution. */
export const fix = Timings.topLevelTimer(function(timings, input: FixInput): FixResult {
  return timings.run(fixSource, input)
})

const fixSource = Timings.measured('fixer.imports', function(input: FixInput): FixResult {
  if (input.tree.rootNode.hasError) {
    Errors.ThrowUserInput('Fixing requires a complete Tao document.')
  }
  const edits = organizeImports(input.source, input.tree, input.ast)
  return { text: applyEdits(input.source, edits), edits }
})
