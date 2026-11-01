import { createParser } from '@grammar/parser'
import { FileSystem, Path } from '@shared/os'

/** findTaoTestFiles discovers authored test suites, excluding hidden and dependency folders. */
export async function findTaoTestFiles(path: string, parser = createParser()): Promise<string[]> {
  if (FileSystem.statSync(path).isFile()) {
    return [path]
  }
  const paths: string[] = []
  for (const entry of await FileSystem.readdir(path, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue
    }
    const child = Path.join(path, entry.name)
    if (entry.isDirectory()) {
      paths.push(...await findTaoTestFiles(child, parser))
    } else if (entry.name.endsWith('.tao')) {
      const tree = parser.parse(await FileSystem.readFile(child, 'utf8'))
      if (tree.rootNode.descendantsOfType('TestsDeclaration').length > 0) {
        paths.push(child)
      }
    } else {
      // Non-Tao files cannot contain authored Tao test suites.
    }
  }
  return paths.sort()
}
