import type * as AST from '@ast-gen'
import type * as CST from '@cst'
import { Timings, UserInput } from '@shared'
import { applyEdits, type SourceEdit } from '../Source'
import { organizeImports } from './FixImports'

/** FixInput pairs complete source syntax with its unmodified semantic AST. */
export type FixInput = { source: string; tree: CST.Tree; ast: AST.Document }

/** FixResult proposes source changes without mutating parsed trees or writing to disk. */
export type FixResult = { text: string; edits: readonly SourceEdit[] }

/** fix organizes a complete document before formatting, without requiring name resolution. */
export const fix = Timings.createTopLevelTimer(function(timings, input: FixInput): FixResult {
  return timings.run(fixSource, input)
})

const fixSource = Timings.measured('fixer.imports', function(input: FixInput): FixResult {
  UserInput.Require(!input.tree.rootNode.hasError, 'Fixing requires a complete Tao document.')
  const edits = organizeImports(input.source, input.tree, input.ast)
  return { text: applyEdits(input.source, edits), edits }
})
