import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { compileLibraryPackage } from '@workspace/LibraryPackage'

Tests.test('compiled Tao library emits explicit own-project public component paths without an app', async () => {
  const output = Artifacts.resolvePath('tmp', `library-package-${Platform.randomUUID()}`)
  await Try(async () => {
    await compileLibraryPackage({
      entry: Repo.resolvePath('Apps/TS Lib App/src/tao/Library.tao'),
      out: output,
      name: '@example/tao-library',
    })
    const manifest = readPackageManifest(await FileSystem.readFile(Path.join(output, 'package.json'), 'utf8'))
    Tests.expect(Object.keys(manifest.exports)).toEqual(['.', './Greeting', './Panel', './cards/Greeting'])
    const bundle = await FileSystem.readFile(Path.join(output, '_Library.js'), 'utf8')
    Tests.expect(bundle).toContain('Nested private Tao helper')
    Tests.expect(bundle).not.toContain(Repo.getWorkspaceRoot())
    Tests.expect(bundle).not.toContain('AppDeclaration(')
  }, {
    async finally() {
      await FileSystem.rm(output, { recursive: true, force: true })
    },
  })
})

function readPackageManifest(source: string): { exports: Record<string, unknown> } {
  const manifest = JSON.parse(source) as { exports?: Record<string, unknown> }
  return manifest.exports ? { exports: manifest.exports } : Errors.ThrowShouldNeverHappen('Package exports missing.')
}
