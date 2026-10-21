import { transform } from '@ast-gen/Transform'
import { IO } from '@cli-kit'
import { fix } from '@fix/Fix'
import { format } from '@fix/Format'
import { createParser } from '@grammar/parser'
import { Errors, Timings } from '@shared'
import { FileSystem } from '@shared/os'
import { unusedWarnings } from '@typecheck/Usage'
import { prepareParser } from '../../cli-checks/parser-build'
import { embeddedFormatting } from './EmbeddedFormatting'

/** updateTaoSource applies requested source tools once before the file watcher observes a save. */
export const updateTaoSource = Timings.topLevelTimer(async function(
  timings,
  path: string,
  mode: 'format' | 'fix',
  print: (message: string) => void = IO.print,
  warn: (message: string) => void = IO.warn,
): Promise<void> {
  await timings.run(prepareParser)
  const parser = timings.run(createParser)
  let source = await FileSystem.readFile(path, 'utf8')
  let tree = timings.run(parser.parse, source)
  if (mode === 'fix') {
    const ast = timings.run(transform, tree)
    if (!ast) {
      Errors.ThrowUserInput(`Fixing requires a complete Tao document: ${path}`)
    }
    const result = timings.run(fix, { source, tree, ast })
    if (result.text !== source) {
      source = result.text
      tree = timings.run(parser.parse, source)
    }
  }
  const typescript = source.includes('```ts') ? await timings.run(embeddedFormatting) : undefined
  const result = timings.run(format, { source, tree }, { typescript })
  await FileSystem.writeIfChanged(path, result.text)
  if (mode === 'fix') {
    printUsageWarnings(path, timings.run(parser.parse, result.text), timings, warn)
  }
  print(
    `${mode === 'fix' ? 'Fixed' : 'Formatted'} ${path}${result.skipped.length ? ' (incomplete syntax skipped)' : ''}`,
  )
})

function printUsageWarnings(
  path: string,
  tree: Parameters<typeof transform>[0],
  timings: Timings,
  warn: (message: string) => void,
): void {
  const ast = timings.run(transform, tree)!
  for (const warning of timings.run(unusedWarnings, ast)) {
    const { row, column } = tree.rootNode.descendantForIndex(warning.start).startPosition
    warn(`${path}:${row + 1}:${column + 1} [${warning.code}] ${warning.message}`)
  }
}
