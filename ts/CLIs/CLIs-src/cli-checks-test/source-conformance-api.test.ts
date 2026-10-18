import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import { checkSourceConformance, sourceConformanceIssues } from '../cli-checks/source-conformance'

const publicApiFixture = S`
  /** greet returns a greeting. */
  export function greet(name: string): string
  export function greet(name: unknown): string { return String(name) }
  /** double returns twice its input. */
  export const double = (value: number) => value * 2
  /** localValue returns a local value. */
  function localValue() { return 1 }
  export { localValue as publicValue }
  /** first stores the first value. */
  /** second stores the second value. */
  export const { first, nested: { second } } = source
  /** third stores the third value. */
  const [third] = source
  export { third as publicThird }
  /** API exposes operations. */
  export namespace API {
    /** run invokes the operation. */
    export function run(): void
  }
  /** Client exposes the service. */
  export class Client {
    /** run invokes the service. */
    run() { return 1 }
  }
  /** api accepts options.
   *  It returns a result. */
  export function api(options: { /** value carries input. */ value: number }): { /** result carries output. */ result: number } {
    return { result: options.value }
  }
  /** defaultValue returns the default value. */
  const defaultValue = () => 1
  export default defaultValue
`

Tests.test('source conformance > accepts documented API groups and public shapes in one fixture', () => {
  Tests.expect(sourceConformanceIssues('fixture.ts', publicApiFixture)).toEqual([])
  Tests.expect(sourceConformanceIssues('fixture.ts', publicApiFixture.replaceAll('\n', '\r\n'))).toEqual([])
})

Tests.test('source conformance > checks ambient namespaces and workspace declarations', async () => {
  for (const declaration of ['export declare namespace API', 'export namespace API']) {
    const filename = declaration.includes('declare') ? 'fixture.ts' : 'fixture.d.ts'
    const source = S`
      /** API exposes operations. */
      ${declaration} {
        function missing(): void
        /** Nested exposes nested operations. */
        namespace Nested {
          /** run invokes the operation. */
          function run(): void
        }
      }
    `
    Tests.expect(sourceConformanceIssues(filename, source)).toEqual([
      `${filename}:3: exported API missing needs JSDoc beginning with its name and a description`,
    ])
  }

  await Artifacts.mkdir(Artifacts.resolvePath('tmp'), { recursive: true })
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-source-conformance-'))
  await Try(async () => {
    await FileSystem.write(
      Path.join(root, 'ts/public.d.ts'),
      '/** publicValue stores a number. */\nexport declare const publicValue: number\n',
    )
    await FileSystem.write(Path.join(root, 'ts/node_modules/ignored/index.ts'), 'export const missingDocs = 1')
    await FileSystem.write(Path.join(root, '.x-tao-old-v1/ignored.ts'), 'export const missingDocs = 1')
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
    await FileSystem.write(Path.join(root, 'ts/public.d.ts'), 'export declare const publicValue: number\n')
    await Tests.expect(checkSourceConformance(root)).rejects.toThrow(
      'ts/public.d.ts:1: exported API publicValue needs JSDoc',
    )
  }, {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})
