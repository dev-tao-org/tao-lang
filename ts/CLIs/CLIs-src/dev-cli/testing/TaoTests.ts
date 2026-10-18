import { IO } from '@cli-kit'
import { createParser } from '@grammar/parser'
import { Errors } from '@shared'
import { FileSystem, HeadlessBrowser, Path, Repo } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'

/** runTaoTests runs self-contained app journeys using the default headless web target. */
export async function runTaoTests(target: string): Promise<void> {
  await prepareParser()
  await prepareRuntime()
  const path = Path.resolve(target)
  const paths = await testPaths(path)
  const { runAppTests } = await import('@workspace/testing/AppTests')
  let passed = 0
  let failed = 0
  for (const file of paths) {
    for (const result of await runAppTests(file, HeadlessBrowser.openTestBrowser)) {
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

async function testPaths(path: string, parser = createParser()): Promise<string[]> {
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
      paths.push(...await testPaths(child, parser))
    } else if (entry.name.endsWith('.tao')) {
      const { tree } = parser.parse(await FileSystem.readFile(child, 'utf8'))
      if (tree.rootNode.descendantsOfType('TestsDeclaration').length > 0) {
        paths.push(child)
      }
    }
  }
  return paths.sort()
}
