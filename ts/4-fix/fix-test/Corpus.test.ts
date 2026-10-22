import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Errors } from '@shared'
import { FileSystem, FormatterResources, Path, Repo, Tests } from '@shared/os'
import { fix } from '../fix-src/Fix'
import { format } from '../fix-src/Format'
import { createTypeScriptFormatter, type EmbeddedFormatter } from '../fix-src/lib/formatter/Embedded'

Tests.test('authored apps and standard views preserve semantic structure and format idempotently', async () => {
  const typescript = createTypeScriptFormatter(await FormatterResources.typeScriptFormatterBytes())
  const paths = [...await listTaoFiles('Apps'), ...await listTaoFiles('ts/stdlib/stdlib-src')]
  Tests.expect(paths.length).toBeGreaterThan(5)
  for (const path of paths) {
    const source = await FileSystem.readFile(path, 'utf8')
    const parser = createParser()
    const tree = parser.parse(source)
    const ast = transform(tree) ?? Errors.ThrowShouldNeverHappen(`Invalid corpus file: ${path}`)
    const formatted = format({ source, tree }, { typescript })
    Tests.expect(formatted.status).toBe('formatted')
    const resultTree = parser.parse(formatted.text)
    Tests.expect(describeSemanticStructure(transform(resultTree), typescript)).toBe(
      describeSemanticStructure(ast, typescript),
    )
    Tests.expect(format({ source: formatted.text, tree: resultTree }, { typescript }).edits).toEqual([])
    const fixed = fix({ source, tree, ast })
    const fixedTree = parser.parse(fixed.text)
    const fixedAst = transform(fixedTree) ?? Errors.ThrowShouldNeverHappen(`Invalid fixed file: ${path}`)
    Tests.expect(fix({ source: fixed.text, tree: fixedTree, ast: fixedAst }).edits).toEqual([])
  }
})

async function listTaoFiles(relative: string): Promise<string[]> {
  const root = Repo.resolvePath(relative)
  const entries = await FileSystem.readdir(root, { withFileTypes: true })
  const paths = await Promise.all(
    entries.filter(entry => !entry.name.startsWith('.')).map(async entry => {
      const path = Path.join(relative, entry.name)
      return entry.isDirectory() ? listTaoFiles(path) : path.endsWith('.tao') ? [Repo.resolvePath(path)] : []
    }),
  )
  return paths.flat()
}

function describeSemanticStructure(value: unknown, typescript: EmbeddedFormatter): string {
  return JSON.stringify(value, (key, item) => {
    if (key === 'start' || key === 'end') {
      return undefined
    }
    return key === 'code'
      ? typescript(item, { indent: 2, level: 0, width: 120, newline: '\n' })
      : item
  })
}
