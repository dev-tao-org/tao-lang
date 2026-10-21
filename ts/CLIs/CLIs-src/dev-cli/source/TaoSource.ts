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
export async function updateTaoSource(
  path: string,
  mode: 'format' | 'fix',
  print: (message: string) => void = IO.print,
  warn: (message: string) => void = IO.warn,
): Promise<void> {
  await prepareParser()
  const parser = createParser()
  const timings = new Timings()
  let source = await FileSystem.readFile(path, 'utf8')
  let { tree } = parser.parse(source, timings)
  if (mode === 'fix') {
    const ast = transform(tree, timings)
    if (!ast) {
      Errors.ThrowUserInput(`Fixing requires a complete Tao document: ${path}`)
    }
    const result = fix({ source, tree, ast }, timings)
    if (result.text !== source) {
      source = result.text
      tree = parser.parse(source, timings).tree
    }
  }
  const typescript = source.includes('```ts') ? await embeddedFormatting(timings) : undefined
  const result = format({ source, tree }, timings, { typescript })
  await FileSystem.writeIfChanged(path, result.text)
  if (mode === 'fix') {
    printUsageWarnings(path, parser.parse(result.text, timings).tree, timings, warn)
  }
  print(
    `${mode === 'fix' ? 'Fixed' : 'Formatted'} ${path}${result.skipped.length ? ' (incomplete syntax skipped)' : ''}`,
  )
}

function printUsageWarnings(
  path: string,
  tree: Parameters<typeof transform>[0],
  timings: Timings,
  warn: (message: string) => void,
): void {
  const ast = transform(tree, timings)!
  for (const warning of unusedWarnings(ast, timings)) {
    const { row, column } = tree.rootNode.descendantForIndex(warning.start).startPosition
    warn(`${path}:${row + 1}:${column + 1} [${warning.code}] ${warning.message}`)
  }
}
