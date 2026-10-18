import { transform } from '@ast-gen/Transform'
import { compile } from '@compile/Compile'
import { createParser } from '@grammar/parser'
import { Errors } from '@shared'
import { FileSystem, type HeadlessBrowser } from '@shared/os'
import { createAppTestDriver } from './AppTestDriver'
import { runTests, type TestProgress, type TestResult } from './RunTests'

/** TestBrowser provides the headless UI operations needed by an app journey. */
export type TestBrowser = HeadlessBrowser.TestBrowser

/** runAppTests compiles and executes one self-contained Tao file on headless web. */
export async function runAppTests(
  path: string,
  openBrowser: () => Promise<TestBrowser>,
  onProgress?: TestProgress,
): Promise<TestResult[]> {
  onProgress?.(`Reading ${path}…`)
  const source = await FileSystem.readFile(path, 'utf8')
  onProgress?.(`Parsing and transforming ${path}…`)
  const document = transform(createParser().parse(source).tree)
    ?? Errors.ThrowUserInput(`Invalid Tao test source: ${path}`)
  onProgress?.(`Parsed and transformed ${path}.`)
  return await runTests(document, {
    path,
    source,
    onProgress,
    createDriver: () => createAppTestDriver(path, source, openBrowser, compile, onProgress),
  })
}
