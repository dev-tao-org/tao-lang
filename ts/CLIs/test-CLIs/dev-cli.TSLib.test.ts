import { Json, S } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import * as Workspace from '@workspace'

import * as WorkspaceTests from '@workspace-tests'
import { writePreparedTaoApp } from './dev-cli.test-fixtures.TaoApp'

Tests.test('standalone TS-Lib Justfile compiles repeatedly and checks its authored consumer from its directory', async () => {
  const directory = await WorkspaceTests.createStandaloneLibraryFixture()
  const menu = await runRecipe(directory)
  Tests.expect(menu).toContain('compile')
  Tests.expect(menu).toContain('run')
  Tests.expect(menu).toContain('check')
  Tests.expect(menu).toContain('test')
  const output = Path.join(directory, '.tao/cache/libraries/Demo')
  await runRecipe(directory, 'compile')
  const first = FS.realpathSync(output)
  await runRecipe(directory, 'compile')
  const second = FS.realpathSync(output)
  Tests.expect(first).not.toBe(second)
  Tests.expect(FS.existsSync(Path.join(first, 'package.json'))).toBe(true)
  Tests.expect(FS.existsSync(Path.join(second, 'package.json'))).toBe(true)
  const packageDirectory = Path.join(directory, 'src/ts')
  Tests.expect(FS.realpathSync(Path.join(packageDirectory, 'node_modules/@example/tao-library'))).toBe(second)
  Tests.expect(FS.resolveModule('@example/tao-library/Greeting', packageDirectory)).toBe(Path.join(second, 'view0.js'))
  await runRecipe(directory, 'check')
  const inferred = await Exec.captureStdout('../../tao', 'compile --package src/ts', { cwd: directory })
  Tests.expect(inferred).toContain('.tao/cache/libraries/Demo')
  await Tests.expect(Exec.captureStdout('../../tao', 'compile Missing --package src/ts', { cwd: directory })).rejects
    .toThrow()
})

Tests.test('library compilation preserves unrelated existing output directories and links', async () => {
  const root = Artifacts.resolvePath('tmp', 'library-output-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  const output = Path.join(root, 'output')
  const sentinel = Path.join(output, 'authored.txt')
  await FS.mkdir(output)
  await FS.writeFile(sentinel, 'preserve authored data')
  const request = { entry: 'unused.tao', out: output, name: '@example/library' }
  await Tests.expect(Workspace.publishLibrary(request)).rejects.toThrow('not owned')
  Tests.expect(await FS.readFile(sentinel, 'utf8')).toBe('preserve authored data')
  const link = Path.join(root, 'foreign-link')
  await FS.symlink(output, link, 'dir')
  await Tests.expect(Workspace.publishLibrary(createLinkedOutputRequest(request, link))).rejects.toThrow(
    'unrelated data',
  )
  Tests.expect(await FS.readFile(sentinel, 'utf8')).toBe('preserve authored data')
})

function createLinkedOutputRequest(request: Parameters<typeof Workspace.publishLibrary>[0], out: string) {
  return { ...request, out }
}

Tests.test('unified compile rejects unknown and ambiguous targets and still compiles an explicit app entry', async () => {
  const root = Artifacts.resolvePath('tmp', 'compile-target-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  await Workspace.initializeProject(root)
  const entry = Path.join(root, 'Main.tao')
  const source = S`
    ts-library One { publish { } }
    ts-library Two { publish { } }
  `
  await FS.writeFile(entry, source)
  await FS.writeFile(
    Path.join(root, 'package.json'),
    Json.Print({ name: 'compile-target-fixture', tao: { compile: { entry: 'Main.tao' } } }),
  )
  await Tests.expect(Workspace.resolveCompileTarget(root)).rejects.toThrow('found 2 matching targets')
  await Tests.expect(Workspace.resolveCompileTarget(root, 'Missing')).rejects.toThrow('found 0 matching targets')
  Tests.expect((await Workspace.resolveCompileTarget(root, 'Two')).target).toBe('Two')
  await writePreparedTaoApp(root)
  const result = await Exec.captureStdout(Repo.resolvePath('tao'), ['compile', entry], { cwd: root })
  Tests.expect(result).toContain('App.tsx')
})

async function runRecipe(directory: string, recipe?: string): Promise<string> {
  return await Exec.captureStdout('just', ['--justfile', Path.join(directory, 'Justfile'), ...recipe ? [recipe] : []], {
    cwd: directory,
  })
}
