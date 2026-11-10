import * as Grammar from '@grammar'
import { Sort } from '@shared'
import { FS, Path } from '@shared/os'

/** findTaoTestFiles discovers authored test suites, excluding hidden and dependency folders. */
export async function findTaoTestFiles(path: string, parser = Grammar.createParser()): Promise<string[]> {
  if (FS.statSync(path).isFile()) {
    return [path]
  }
  const paths: string[] = []
  for (const entry of await FS.readdir(path, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue
    }
    const child = Path.join(path, entry.name)
    if (entry.isDirectory()) {
      paths.push(...await findTaoTestFiles(child, parser))
    } else if (entry.name.endsWith('.tao')) {
      const tree = parser.parse(await FS.readFile(child, 'utf8'))
      if (tree.rootNode.descendantsOfType('TestsDeclaration').length > 0) {
        paths.push(child)
      }
    } else {
      // Non-Tao files cannot contain authored Tao test suites.
    }
  }
  return paths.sort(Sort.CompareStrings)
}
