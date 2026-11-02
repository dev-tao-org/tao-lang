import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import { checkSourceConformance } from '../cli-checks/source-conformance'

Tests.test('source conformance > hides module implementations behind sibling and nested public facades', async () => {
  const root = await createFixture()
  await Try(async () => {
    await expectPrivateImportRejected(root, './Feature/Details', 'Feature.ts')
    await expectPrivateImportRejected(root, '@feature/Details', 'Feature.ts')
    await writeConsumer(root, "import { value } from './Feature'; void value")
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
    await expectPrivateImportRejected(root, './Feature/external/Operation', 'Feature/external.ts')
    await writeConsumer(root, "import { value } from './Feature/external'; void value")
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
    await writeConsumer(root, "import { value } from './Feature/Public'; void value")
    await Tests.expect(checkSourceConformance(root)).resolves.toBeUndefined()
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('source conformance > requires sibling facade files to contain only imports and exports', async () => {
  const root = await createFixture()
  await Try(async () => {
    await FileSystem.write(Path.join(root, 'ts/Feature.ts'), '/** value records a number. */\nexport const value = 1\n')
    await Tests.expect(checkSourceConformance(root)).rejects.toThrow('facade files contain only imports and re-exports')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

async function createFixture(): Promise<string> {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-facade-'))
  const files = {
    'ts/tsconfig.base.json': JSON.stringify({
      compilerOptions: { strict: true, paths: { '@feature/*': ['./Feature/*'] } },
    }),
    'ts/Feature.ts': "export { value } from './Feature/Details'; export * as Public from './Feature/Public'",
    'ts/Feature/Details.ts': '/** value records a number. */\nexport const value = 1\n',
    'ts/Feature/Inside.ts': "import { value } from './Details'; void value",
    'ts/Feature-test/Probe.ts': "import { value } from '../Feature/Details'; void value",
    'ts/Feature/Public.ts': '/** value records a published sub-API number. */\nexport const value = 3\n',
    'ts/Feature/external.ts': "export { value } from './external/Operation'",
    'ts/Feature/external/Operation.ts': '/** value records an external number. */\nexport const value = 2\n',
  }
  for (const [path, source] of Object.entries(files)) {
    await FileSystem.write(Path.join(root, path), source)
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
  await Tests.expect(checkSourceConformance(root)).rejects.toThrow(`import through ts/${facade}`)
}

async function writeConsumer(root: string, source: string): Promise<void> {
  await FileSystem.write(Path.join(root, 'ts/consumer.ts'), source)
}
