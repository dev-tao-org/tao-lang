import { Json } from '@shared'
import { Errors, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import * as Workspace from '@workspace'
import * as WorkspaceTests from '@workspace-tests'

Tests.test('compiled Tao library emits explicit own-project public component paths without an app', async () => {
  const output = Artifacts.resolvePath('tmp', `library-package-${Platform.randomUUID()}`)
  const directory = await WorkspaceTests.createStandaloneLibraryFixture()
  await Try(async () => {
    await Workspace.compileLibraryPackage({
      entry: Path.join(directory, 'src/tao/Library.tao'),
      out: output,
      name: '@example/tao-library',
    })
    const manifest = readPackageManifest(await FS.readFile(Path.join(output, 'package.json'), 'utf8'))
    Tests.expect(Object.keys(manifest.exports)).toEqual([
      '.',
      './Greeting',
      './Panel',
      './LanguageFeatures',
      './ValueSnapshots',
      './DisabledPreview',
      './Catalog/Greeting',
    ])
    const bundle = await FS.readFile(Path.join(output, '_Library.js'), 'utf8')
    Tests.expect(bundle).toContain('Nested private Tao helper')
    Tests.expect(bundle).not.toContain(Repo.getWorkspaceRoot())
    Tests.expect(bundle).not.toContain('AppDeclaration(')
  }, {
    async finally() {
      await FS.rm(output, { recursive: true, force: true })
    },
  })
})

function readPackageManifest(source: string): { exports: Record<string, unknown> } {
  const manifest = Json.Parse(source) as { exports?: Record<string, unknown> }
  return manifest.exports ? { exports: manifest.exports } : Errors.ThrowShouldNeverHappen('Package exports missing.')
}
