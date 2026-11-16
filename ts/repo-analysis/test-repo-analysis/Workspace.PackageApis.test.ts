import { Json, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import * as PackageApis from '../repo-analysis-src/Workspace/PackageApis'

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
    PackageApis.synchronizePackageApis(root)
    Tests.expect(() => PackageApis.assertPackageApis(root)).not.toThrow()
    await assertFolderOwnershipContract(root)
    await writeApiFixture(root, './example-src/*', '@example/*')
    Tests.expect(() => PackageApis.assertPackageApis(root)).toThrow('exact file exports')
    await writeApiFixture(root, './example-src/Absent.ts', '@example')
    Tests.expect(() => PackageApis.assertPackageApis(root)).toThrow('existing file')
    await writeApiFixture(root, './example-src/Example.ts', '@example')
    const manifestPath = Path.join(root, 'ts/example/package.json')
    const extraExport = {
      exports: { '.': './example-src/Example.ts', './*': './example-src/*' },
      tao: {
        publicApi: { '.': { alias: '@example', namespace: 'Example' } },
        testInputs: ['./test-example/input-fixtures'],
      },
    }
    await FS.write(manifestPath, serializeApiFixture(extraExport))
    Tests.expect(() => PackageApis.assertPackageApis(root)).toThrow('Every export requires public API metadata')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('public operations use their canonical namespace while primary entities remain narrow', () => {
  const namespaces = new Map([['@example', { namespace: 'Example' }]])
  Tests.expect(checkNamespace("import * as Wrong from '@example'", namespaces)).toBe('use canonical namespace Example')
  Tests.expect(checkNamespace("import { createExample } from '@example'", namespaces)).toContain('import * as Example')
  Tests.expect(checkNamespace("import * as Example from '@example'", namespaces)).toBeUndefined()
  Tests.expect(checkNamespace("import { Example } from '@example'", namespaces)).toBeUndefined()
  Tests.expect(checkDynamicNamespace("const Example = await import('@example')", namespaces)).toBeUndefined()
  Tests.expect(checkDynamicNamespace("const { value } = await import('@example')", namespaces)).toContain(
    'canonical namespace Example',
  )
  Tests.expect(checkDynamicNamespace("const Other = await import('@example')", namespaces)).toContain(
    'canonical namespace Example',
  )
  Tests.expect(checkDynamicNamespace("const { value } = await import('external')", namespaces)).toBeUndefined()
})

type OptionalNamespaceIssue = string | undefined

function checkDynamicNamespace(source: string, namespaces: PackageApis.PackageImportRules): string | undefined {
  const file = TypeScript.createSourceFile('consumer.ts', source, TypeScript.ScriptTarget.Latest, true)
  let issue: OptionalNamespaceIssue
  function visit(node: TypeScript.Node): void {
    issue ??= PackageApis.packageNamespaceIssue(node, namespaces)
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issue
}

function checkNamespace(source: string, namespaces: PackageApis.PackageImportRules): string | undefined {
  const file = TypeScript.createSourceFile('consumer.ts', source, TypeScript.ScriptTarget.Latest, true)
  const declaration = file.statements[0]
  Tests.expect(TypeScript.isImportDeclaration(declaration)).toBe(true)
  return PackageApis.packageNamespaceIssue(declaration as TypeScript.ImportDeclaration, namespaces)
}

async function writeApiFixture(root: string, target: string, alias: string): Promise<void> {
  const inputs = Path.join(root, 'ts/example/test-example/input-fixtures')
  await FS.mkdir(inputs)
  await FS.write(Path.join(inputs, 'Input.test.ts'), 'export const input = 1')
  const manifest = {
    name: '@tao/example',
    exports: { '.': target },
    tao: {
      publicApi: { '.': { alias, namespace: 'Example' } },
      testInputs: ['./test-example/input-fixtures'],
    },
  }
  await FS.write(Path.join(root, 'ts/example/package.json'), serializeApiFixture(manifest))
  const paths = { [alias]: ['./example/example-src/Example.ts'] }
  await FS.write(Path.join(root, 'ts/tsconfig.base.json'), serializeApiFixture({ compilerOptions: { paths } }))
}

async function assertFolderOwnershipContract(root: string): Promise<void> {
  const tests = Path.join(root, 'ts/example/test-example')
  await FS.write(Path.join(tests, 'Example.Core.test.ts'), '// root concern')
  await FS.write(Path.join(tests, 'Missing.test.ts'), '// no source folder')
  Tests.expect(() => PackageApis.assertPackageApis(root)).toThrow('mirrored source-folder owner')
  await FS.rm(Path.join(tests, 'Missing.test.ts'))
  await FS.write(Path.join(tests, 'Example.test.ts'), '// mixed base and concern')
  Tests.expect(() => PackageApis.assertPackageApis(root)).toThrow('one base file or concern files')
  await FS.rm(Path.join(tests, 'Example.test.ts'))
  await FS.mkdir(Path.join(root, 'ts/example/example-src/Feature'))
  await FS.write(Path.join(root, 'ts/example/example-src/Feature/Value.ts'), 'export const value = 1')
  await FS.write(Path.join(tests, 'Feature.test.ts'), '// nested folder owner')
  Tests.expect(() => PackageApis.assertPackageApis(root)).not.toThrow()
}

function serializeApiFixture(value: unknown): string {
  return Json.Print(value)
}
