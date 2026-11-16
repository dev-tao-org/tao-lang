import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { analyzeTestOnlyUsage } from '../repo-analysis-src/Workspace/TestOnlyUsage'

Tests.test('test-only usage follows re-exports and keeps static callers and external contracts', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-usage-'))
  await Try(async () => {
    const files = await writeUsageFixture(root)
    const main = Path.win32.join(root, 'test-main.ts')
    const sdk = Path.win32.join(root, 'SDK.ts')
    const lib = ['lib.es5.d.ts', 'lib.es2015.promise.d.ts']
    const program = TypeScript.createProgram(files, { lib, strict: true, noEmit: true })
    const usage = analyzeTestOnlyUsage(program, files, { root, entries: new Set([main]), contracts: new Set([sdk]) })
    const portableRoot = root.replaceAll('\\', '/')
    Tests.expect(usage.modules).toEqual([
      {
        file: Path.posix.join(portableRoot, 'OnlyType.ts'),
        testReference: { file: Path.posix.join(portableRoot, 'Usage.test.ts'), line: 7 },
      },
      {
        file: Path.posix.join(portableRoot, 'TestTool.ts'),
        testReference: { file: Path.posix.join(portableRoot, 'test-support/Support.ts'), line: 1 },
      },
    ])
    Tests.expect(usage.declarations).toEqual([
      {
        name: 'testOnly',
        declaration: { file: Path.posix.join(portableRoot, 'Operations.ts'), line: 2 },
        testReference: { file: Path.posix.join(portableRoot, 'Usage.test.ts'), line: 3 },
      },
    ])
    Tests.expect(usage.optionalArguments).toEqual([
      {
        name: 'options',
        declaration: { file: Path.posix.join(portableRoot, 'Operations.ts'), line: 4 },
        testReference: { file: Path.posix.join(portableRoot, 'Usage.test.ts'), line: 4 },
      },
    ])
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

async function writeUsageFixture(root: string): Promise<string[]> {
  const files = {
    'test-main.ts': S`
      import * as Facade from './Facade'
      const { ambiguous, invoke, shared, sdkInvoke } = await import('./Facade')
      const typed: Facade.ContractType = shared
      void typed
      void shared
      invoke(1)
      ambiguous(...[1] as const)
      sdkInvoke(1)
    `,
    'Facade.ts':
      "export { ambiguous, type ContractType, invoke, shared, sdkInvoke, testOnly as probe } from './Operations'",
    'Operations.ts': S`
      export const shared = 1
      export const testOnly = 2
      export const contract = 3
      export function invoke(value: number, options?: { debug: boolean }) { return [value, options] }
      export function ambiguous(value: number, options?: boolean) { return [value, options] }
      export function sdkInvoke(value: number, options?: boolean) { return [value, options] }
      export type ContractType = number
    `,
    'SDK.ts': "export { contract, sdkInvoke } from './Operations'",
    'OnlyType.ts': 'export type Shape = { readonly name: string }',
    'TestTool.ts': 'export const testTool = 4',
    'test-support/Support.ts': "import { testTool } from '../TestTool'; void testTool",
    'Usage.test.ts': S`
      import * as Facade from './Facade'
      import { contract } from './SDK'
      void [Facade.probe, Facade.shared, contract]
      Facade.invoke(1, { debug: true })
      Facade.ambiguous(1, true)
      Facade.sdkInvoke(1, true)
      export type Shape = import('./OnlyType').Shape
      import './test-main'
    `,
  }
  return await Promise.all(
    Object.entries(files).map(async ([file, source]) => {
      const filename = Path.join(root, file)
      await FS.write(filename, source)
      return filename
    }),
  )
}
