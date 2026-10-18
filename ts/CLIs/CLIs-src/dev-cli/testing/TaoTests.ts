import { IO } from '@cli-kit'
import { createParser } from '@grammar/parser'
import { FileSystem, Path } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { planTestExecution } from './TestPlan'
import { runTestPlan, type TestExecutionOptions } from './TestWorkers'

/** runTaoTests runs self-contained app journeys using the default headless web target. */
export async function runTaoTests(target: string, options: TestExecutionOptions = {}): Promise<void> {
  planTestExecution({ taoTarget: target, ...options })
  IO.progress('Preparing headless Tao app tests…')
  await prepareParser()
  await prepareRuntime()
  await runTestPlan({ taoTarget: Path.resolve(target), ...options })
}

/** findTaoTestFiles discovers authored test suites, excluding hidden and dependency folders. */
export async function findTaoTestFiles(
  path: string,
  parser = createParser(),
): Promise<string[]> {
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
      const { tree } = parser.parse(await FileSystem.readFile(child, 'utf8'))
      if (tree.rootNode.descendantsOfType('TestsDeclaration').length > 0) {
        paths.push(child)
      }
    }
  }
  return paths.sort()
}
