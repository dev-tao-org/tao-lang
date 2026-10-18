import { transform } from '@ast-gen/Transform'
import { IO } from '@cli-kit'
import { fix } from '@fix/Fix'
import { format } from '@fix/Format'
import { createParser } from '@grammar/parser'
import { Errors, Timings } from '@shared'
import { FileSystem } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'

/** updateTaoSource applies requested source tools once before the file watcher observes a save. */
export async function updateTaoSource(
  path: string,
  mode: 'format' | 'fix',
  print: (message: string) => void = IO.print,
): Promise<void> {
  await prepareParser()
  const parser = createParser()
  const timings = new Timings('source-tools')
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
  const result = format({ source, tree }, timings)
  await FileSystem.writeIfChanged(path, result.text)
  print(
    `${mode === 'fix' ? 'Fixed' : 'Formatted'} ${path}${
      result.skipped.length ? ' (incomplete declarations skipped)' : ''
    }`,
  )
}
