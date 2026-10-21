import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import { checkSourceConformance } from '../cli-checks/source-conformance'

Tests.test('source conformance > checks workspace declarations and ignores dependency and legacy sources', async () => {
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

Tests.test('source conformance > resolves imported member types before recommending optional access', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-optional-access-'))
  await Try(async () => {
    await FileSystem.write(
      Path.join(root, 'ts/tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: { strict: true, paths: { '@model': ['./model.ts'] } },
      }),
    )
    await FileSystem.write(
      Path.join(root, 'ts/model.ts'),
      S`
        /** Token represents a parsed label. */
        export interface Token { text: string }
      `,
    )
    const source = S`
      import type { Token } from '@model'
      declare const token: Token | null
      token ? token.text as 'label' : undefined
    `
    await FileSystem.write(Path.join(root, 'ts/consumer.ts'), source)
    await Tests.expect(checkSourceConformance(root)).rejects.toThrow(
      'ts/consumer.ts:3: prefer optional access',
    )
    await FileSystem.write(
      Path.join(root, 'ts/consumer.ts'),
      source.replace(
        "token ? token.text as 'label' : undefined",
        "token?.text as 'label' | undefined",
      ),
    )
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
  }, {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})
