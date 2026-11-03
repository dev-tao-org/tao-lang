import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import * as PackageApis from '../../CLIs-src/cli-checks/PackageApis'

Tests.test('public APIs derive exact aliases from manifests and reject drift and wildcard access', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'package-apis-'))
  await Try(async () => {
    await FS.mkdir(Path.join(root, 'ts/example/example-src'))
    await FS.write(Path.join(root, 'ts/example/example-src/Example.ts'), 'export const value = 1')
    await writeApiFixture(root, './example-src/Example.ts', '@example')
    Tests.expect(() => PackageApis.assertPackageApis(root)).not.toThrow()
    Tests.expect(PackageApis.readPackageImportRules(root).get('@example')?.namespace).toBe('Example')
    await FS.write(Path.join(root, 'ts/tsconfig.base.json'), '{"compilerOptions":{"paths":{}}}')
    Tests.expect(() => PackageApis.assertPackageApis(root)).toThrow('paths must match')
    await writeApiFixture(root, './example-src/*', '@example/*')
    Tests.expect(() => PackageApis.assertPackageApis(root)).toThrow('exact file exports')
    await writeApiFixture(root, './example-src/Absent.ts', '@example')
    Tests.expect(() => PackageApis.assertPackageApis(root)).toThrow('existing file')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('public operations use their canonical namespace while primary entities remain narrow', () => {
  const namespaces = new Map([['@example', { namespace: 'Example' }]])
  Tests.expect(checkNamespace("import * as Wrong from '@example'", namespaces)).toBe('use canonical namespace Example')
  Tests.expect(checkNamespace("import { createExample } from '@example'", namespaces)).toContain('import * as Example')
  Tests.expect(checkNamespace("import * as Example from '@example'", namespaces)).toBeUndefined()
  Tests.expect(checkNamespace("import { Example } from '@example'", namespaces)).toBeUndefined()
})

function checkNamespace(source: string, namespaces: PackageApis.PackageImportRules): string | undefined {
  const file = TypeScript.createSourceFile('consumer.ts', source, TypeScript.ScriptTarget.Latest, true)
  const declaration = file.statements[0]
  Tests.expect(TypeScript.isImportDeclaration(declaration)).toBe(true)
  return PackageApis.packageNamespaceIssue(declaration as TypeScript.ImportDeclaration, namespaces)
}

async function writeApiFixture(root: string, target: string, alias: string): Promise<void> {
  const manifest = {
    name: '@tao/example',
    exports: { '.': target },
    tao: { publicApi: { '.': { alias, namespace: 'Example' } } },
  }
  await FS.write(Path.join(root, 'ts/example/package.json'), JSON.stringify(manifest))
  const paths = { [alias]: ['./example/example-src/Example.ts'] }
  await FS.write(Path.join(root, 'ts/tsconfig.base.json'), JSON.stringify({ compilerOptions: { paths } }))
}
