import { Schema, Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'

import { createStandaloneLibraryFixture, installRelocatedLibrary } from './Workspace.test-utils'

Tests.test('an ordinary TypeScript consumer typechecks a relocated library and its independent runtime package', async () => {
  const root = await createStandaloneLibraryFixture()
  await Try(async () => {
    const output = Path.join(root, 'exported')
    const name = '@tao-dev/ts-lib-example'
    const args = ['compile', '--ts-lib', 'Demo', '--out', output, '--package', 'src/ts', '--session', 'export']
    const result = await Exec.captureStdout(Repo.resolvePath('tao'), args, { cwd: root })
    Tests.expect(result.trim()).toBe(output)
    Tests.expect(FS.existsSync(Path.join(root, '.tao/cache/sessions/export/libraries/Demo'))).toBe(false)
    const manifest = await FS.readJson(Path.join(output, 'package.json'), { schema: LibraryManifest })
    Tests.expect(manifest.exports).toEqual({
      '.': './ts/Library.ts',
      './@cards': './ts/@cards.ts',
      './@cards/details': './ts/@cards/details.ts',
    })
    Tests.expect(manifest.peerDependencies['@tao/runtime']).toBe('0.0.0')
    Tests.expect((await FS.readdir(output)).sort()).toEqual(['package.json', 'ts'])
    await verifyPortableOutput(output, root)
    await verifyRelocatedConsumer(output, root, name)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

const LibraryManifest = Schema.object({
  exports: Schema.record(Schema.string(), Schema.string()),
  peerDependencies: Schema.record(Schema.string(), Schema.string()),
})

async function verifyPortableOutput(output: string, project: string): Promise<void> {
  const files = await FS.readdir(output, { recursive: true })
  Tests.expect(files.some(path => path.endsWith('.tao'))).toBe(false)
  Tests.expect(files.some(path => path.endsWith('.js'))).toBe(false)
  const sourceFiles = await FS.listSourceFiles(output)
  const sources = (await Promise.all(sourceFiles.map(path => FS.readFile(path, 'utf8')))).join('\n')
  Tests.expect(sources).toContain('Nested private Tao helper')
  Tests.expect(sources).not.toContain(Repo.getWorkspaceRoot())
  Tests.expect(sources).not.toContain(project)
  Tests.expect(sources).not.toContain('AppDeclaration(')
}

async function verifyRelocatedConsumer(output: string, root: string, name: string): Promise<void> {
  const cwd = Path.join(root, 'src/ts')
  const library = await installRelocatedLibrary(root, output, name)
  await Exec.captureStdout('tsc', ['--project', 'tsconfig.json', '--noEmit'], { cwd })
  const configuration = Path.join(library, 'ts/tsconfig.json')
  await Exec.captureStdout('tsc', ['--project', configuration, '--noEmit'], { cwd })
}
