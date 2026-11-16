import * as AST from '@ast-gen'
import * as Compile from '@compile'
import * as Grammar from '@grammar'
import type * as Runtime from '@runtime'

import { Errors } from '@shared'
import { FS } from '@shared/os'
import { createAppTestDriver } from './AppTestDriver'
import * as RunTests from './RunTests'

/** AppTestTarget opens a visible UI session on one supported platform. */
export type AppTestTarget = {
  platform: Runtime.ExpoPlatform
  openDevice(): Promise<AppTestDevice>
}

/** AppTestDevice connects a journey's UI operations to the running application. */
export type AppTestDevice = Omit<RunTests.TestDriver, 'run'> & { open(url: string): Promise<void> }

/** runAppTests compiles and executes one Tao test file against the selected target. */
export async function runAppTests(
  path: string,
  target: AppTestTarget,
  onProgress?: RunTests.TestProgress,
  signal?: AbortSignal,
): Promise<RunTests.TestResult[]> {
  const source = await FS.readFile(path, 'utf8')
  const document = AST.transform(Grammar.createParser().parse(source))
  if (document === undefined) {
    Errors.ThrowUserInput(`Invalid Tao test source: ${path}`)
  }
  const createDriver = () => createAppTestDriver(path, source, target, Compile.compile, onProgress, signal)
  return await RunTests.runTests(document, { path, source, onProgress, signal, createDriver })
}
