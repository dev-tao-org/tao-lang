import * as AST from '@ast-gen'
import { IO } from '@cli-kit'
import * as Fix from '@fix'
import type * as Embedded from '@fix/embedded'
import * as Grammar from '@grammar'
import * as Typecheck from '@typecheck'

import { Timings, UserInput } from '@shared'
import { FS } from '@shared/os'

import { prepareParser } from '../../cli-checks/parser-build'
import { embeddedFormatting } from './EmbeddedFormatting'

/** updateTaoSource applies requested source tools once before the file watcher observes a save. */
export const updateTaoSource = Timings.createTopLevelTimer(async function(
  timings,
  path: string,
  mode: SourceUpdateMode,
  print: (message: string) => void = IO.print,
  warn: (message: string) => void = IO.warn,
): Promise<void> {
  await timings.run(prepareParser)
  const parser = timings.run(Grammar.createParser)
  const input = await readSourceSnapshot(path, parser, timings)
  const prepared = mode === 'fix' ? applySourceFixes(path, input, parser, timings) : input
  const typescript = await resolveEmbeddedFormatter(prepared.source, timings)
  const result = timings.run(Fix.format, prepared, { typescript })
  await FS.writeIfChanged(path, result.text)
  if (mode === 'fix') {
    printUsageWarnings(path, timings.run(parser.parse, result.text), timings, warn)
  }
  const message = describeSourceUpdate(path, mode, result)
  print(message)
})

type SourceUpdateMode = 'format' | 'fix'
type SourceParser = Grammar.Parser

async function readSourceSnapshot(path: string, parser: SourceParser, timings: Timings): Promise<Fix.FormatInput> {
  const source = await FS.readFile(path, 'utf8')
  const tree = timings.run(parser.parse, source)
  return { source, tree }
}

function applySourceFixes(
  path: string,
  input: Fix.FormatInput,
  parser: SourceParser,
  timings: Timings,
): Fix.FormatInput {
  const ast = timings.run(AST.transform, input.tree)
  if (!ast) {
    UserInput.Fail(`Fixing requires a complete Tao document: ${path}`)
  }
  const result = timings.run(Fix.fix, { source: input.source, tree: input.tree, ast })
  if (result.text === input.source) {
    return input
  }
  // Import fixes change source offsets; format against a fresh tree for the corrected source.
  const tree = timings.run(parser.parse, result.text)
  return { source: result.text, tree }
}

async function resolveEmbeddedFormatter(
  source: string,
  timings: Timings,
): Promise<Embedded.EmbeddedFormatter | undefined> {
  return source.includes('```ts') ? await timings.run(embeddedFormatting) : undefined
}

function describeSourceUpdate(path: string, mode: SourceUpdateMode, result: Fix.FormatResult): string {
  const actionLabel = mode === 'fix' ? 'Fixed' : 'Formatted'
  const skippedNotice = result.skipped.length ? ' (incomplete syntax skipped)' : ''
  return `${actionLabel} ${path}${skippedNotice}`
}

function printUsageWarnings(
  path: string,
  tree: Grammar.ParsedTree,
  timings: Timings,
  warn: (message: string) => void,
): void {
  const ast = timings.run(AST.transform, tree)!
  for (const warning of timings.run(Typecheck.unusedWarnings, ast)) {
    const { row, column } = tree.rootNode.descendantForIndex(warning.range.start).startPosition
    warn(`${path}:${row + 1}:${column + 1} [${warning.code}] ${warning.message}`)
  }
}
