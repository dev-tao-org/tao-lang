import * as AST from '@ast-gen'
import * as Compile from '@compile'
import * as Grammar from '@grammar'

import { UserInput } from '@shared'
import { FS, type HeadlessBrowser } from '@shared/os'
import { createAppTestDriver } from './AppTestDriver'
import { runTests, type TestProgress, type TestResult } from './RunTests'

/** TestBrowser provides the headless UI operations needed by an app journey. */
export type TestBrowser = HeadlessBrowser.TestBrowser

/** runAppTests compiles and executes one self-contained Tao file on headless web. */
export async function runAppTests(
  path: string,
  openBrowser: () => Promise<TestBrowser>,
  onProgress?: TestProgress,
  signal?: AbortSignal,
): Promise<TestResult[]> {
  const source = await FS.readFile(path, 'utf8')
  const document = AST.transform(Grammar.createParser().parse(source))
  if (document === undefined) {
    UserInput.fail(`Invalid Tao test source: ${path}`)
  }
  const createDriver = () => createAppTestDriver(path, source, openBrowser, Compile.compile, onProgress, signal)
  return await runTests(document, { path, source, onProgress, signal, createDriver })
}
