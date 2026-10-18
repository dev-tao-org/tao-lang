import { IO } from '@cli-kit'
import { createParser } from '@grammar/parser'
import { Errors, Time } from '@shared'
import { FileSystem, HeadlessBrowser, Path, Repo } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'

/** runTaoTests runs self-contained app journeys using the default headless web target. */
export async function runTaoTests(target: string): Promise<void> {
  const progress = createProgress()
  progress('Preparing headless Tao app tests…')
  await prepareParser()
  await prepareRuntime()
  const path = Path.resolve(target)
  const paths = await findTaoTestFiles(path)
  if (paths.length === 0) {
    Errors.ThrowUserInput(`No Tao test suites found in ${path}.`)
  }
  const { runAppTests } = await import('@workspace/testing/AppTests')
  let passed = 0
  let failed = 0
  for (const file of paths) {
    const relativePath = Path.relative(Repo.getWorkspaceRoot(), file)
    progress(`Testing ${relativePath}…`)
    for (const result of await runAppTests(file, HeadlessBrowser.openTestBrowser, progress)) {
      const location = `${Path.relative(Repo.getWorkspaceRoot(), file)}:${result.line}`
      IO.print(
        `${result.status === 'passed' ? 'PASS' : 'FAIL'} ${result.label} (${location}, ${
          result.durationMs.toFixed(0)
        }ms)`,
      )
      if (result.status === 'passed') {
        passed++
      } else {
        failed++
        IO.print(result.error)
      }
    }
  }
  IO.print(`Tao tests (headless web): ${passed} passed, ${failed} failed.`)
  if (failed > 0 || passed === 0) {
    Errors.ThrowUserInput('Tao app tests failed.')
  }
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

function createProgress(): (message: string) => void {
  const startedAt = Time.nowMs()
  let previousAt = startedAt
  return (message: string): void => {
    const now = Time.nowMs()
    IO.progress(`[${((now - startedAt) / 1000).toFixed(2)}s, ${((now - previousAt) / 1000).toFixed(2)}s] ${message}`)
    previousAt = now
  }
}
