import { Json } from '@shared'
import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { analyzeSourceConformance } from '../repo-analysis-src/Source/source-conformance'
import { readConformanceMessages } from './Source.test-fixtures'

Tests.test('source conformance > hides module implementations behind sibling and nested public facades', async () => {
  const root = await createFixture()
  await Try(async () => {
    await expectPrivateImportRejected(root, './Feature/Details', 'Feature.ts')
    await expectPrivateImportRejected(root, '@feature/Details', 'Feature.ts')
    await writeConsumer(root, "import { value } from './Feature'; void value")
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
    await expectPrivateImportRejected(root, './Feature/external/Operation', 'Feature/external.ts')
    await writeConsumer(root, "import { value } from './Feature/external'; void value")
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
    await writeConsumer(root, "import { value } from './Feature/Public'; void value")
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
    await writeConsumer(root, "import singleton from './Feature/Singleton'; void singleton")
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('source conformance > requires sibling facade files to contain only imports and exports', async () => {
  const root = await createFixture()
  await Try(async () => {
    await FS.write(
      Path.join(root, 'ts/fixture/fixture-src/Feature.ts'),
      S`
        /** value records a number. */
        export const value = 1
      `,
    )
    Tests.expect(await readConformanceMessages(root)).toContain('facade files contain only imports and re-exports')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('source conformance > enforces manifest namespaces through the integrated source walk', async () => {
  const root = await createFixture()
  await Try(async () => {
    await FS.writeJson(Path.join(root, 'ts/package.json'), { workspaces: ['fixture'] })
    const manifest = {
      tao: { publicApi: { '.': { alias: '@fixture', namespace: 'Fixture' } } },
      exports: {
        '.': './fixture-src/Feature.ts',
      },
    }
    await FS.write(Path.join(root, 'ts/fixture/package.json'), Json.Print(manifest))
    const config = {
      compilerOptions: {
        strict: true,
        paths: {
          '@fixture': ['./fixture/fixture-src/Feature.ts'],
        },
      },
    }
    await FS.write(Path.join(root, 'ts/tsconfig.base.json'), Json.Print(config))
    await writeConsumer(root, "import * as Wrong from '@fixture'; void Wrong")
    Tests.expect(await readConformanceMessages(root)).toContain('use canonical namespace Fixture')
    await writeConsumer(root, "const Wrong = await import('@fixture'); void Wrong")
    Tests.expect(await readConformanceMessages(root)).toContain(
      'bind dynamic public imports to canonical namespace Fixture',
    )
    await writeConsumer(root, "import * as Fixture from '@fixture'; void Fixture")
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
    await writeConsumer(root, "const Fixture = await import('@fixture'); void Fixture")
    Tests.expect((await analyzeSourceConformance(root)).findings).toEqual([])
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

async function createFixture(): Promise<string> {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-facade-'))
  const files = {
    'ts/tsconfig.base.json': Json.Print({
      compilerOptions: { strict: true, paths: { '@feature/*': ['./fixture/fixture-src/Feature/*'] } },
    }),
    'ts/Feature.ts':
      "export { value } from './Feature/Details'; export * as Public from './Feature/Public'; export { default as Singleton } from './Feature/Singleton'",
    'ts/Feature/Singleton.ts': S`
      /** singleton records a public default module. */
      const singleton = 1
      export default singleton
    `,
    'ts/Feature/Details.ts': S`
      /** value records a number. */
      export const value = 1
    `,
    'ts/Feature/Inside.ts': "import { value } from './Details'; void value",
    'ts/Feature.Probe.test.ts': "import { value } from '../fixture-src/Feature/Details'; void value",
    'ts/Feature/Public.ts': S`
      /** value records a published sub-API number. */
      export const value = 3
    `,
    'ts/Feature/external.ts': "export { value } from './external/Operation'",
    'ts/Feature/external/Operation.ts': S`
      /** value records an external number. */
      export const value = 2
    `,
  }
  for (const [path, source] of Object.entries(files)) {
    const destination = facadeFixturePath(path)
    await FS.write(Path.join(root, destination), source)
  }
  return root
}

async function expectPrivateImportRejected(root: string, specifier: string, facade: string): Promise<void> {
  await writeConsumer(
    root,
    S`
      import { value } from '${specifier}'; void value
    `,
  )
  Tests.expect(await readConformanceMessages(root)).toContain(`import through ts/fixture/fixture-src/${facade}`)
}

async function writeConsumer(root: string, source: string): Promise<void> {
  await FS.write(Path.join(root, 'ts/fixture/fixture-src/consumer.ts'), source)
}

function facadeFixturePath(path: string): string {
  if (path === 'ts/tsconfig.base.json') {
    return path
  }
  if (path === 'ts/Feature.Probe.test.ts') {
    return 'ts/fixture/test-fixture/Feature.Probe.test.ts'
  }
  return path.replace('ts/', 'ts/fixture/fixture-src/')
}
