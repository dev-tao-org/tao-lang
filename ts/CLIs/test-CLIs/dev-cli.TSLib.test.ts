import { Json, S, Try } from '@shared'
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
  const output = Path.join(directory, '.tao/cache/sessions/.cli/libraries/Demo')
  await runRecipe(directory, 'compile')
  const first = FS.realpathSync(output)
  await FS.writeFile(Path.join(output, 'stale.js'), 'obsolete output')
  await runRecipe(directory, 'compile')
  const second = FS.realpathSync(output)
  Tests.expect(first).toBe(second)
  Tests.expect(FS.lstatSync(output).isSymbolicLink()).toBe(false)
  Tests.expect(FS.existsSync(Path.join(output, 'stale.js'))).toBe(false)
  Tests.expect(await FS.readFile(Path.join(output, 'ts/Library.ts'), 'utf8')).toContain(' as Greeting')
  Tests.expect(FS.existsSync(Path.join(first, 'package.json'))).toBe(true)
  Tests.expect(FS.existsSync(Path.join(second, 'package.json'))).toBe(true)
  const packageDirectory = Path.join(directory, 'src/ts')
  Tests.expect(FS.realpathSync(Path.join(packageDirectory, 'node_modules/@tao-dev/ts-lib-example'))).toBe(second)
  Tests.expect(FS.resolveModule('@tao-dev/ts-lib-example/@cards/details', packageDirectory)).toBe(
    Path.join(second, 'ts/@cards/details.ts'),
  )
  await runRecipe(directory, 'check')
  const inferred = await Exec.captureStdout('../../tao', 'compile --package src/ts', { cwd: directory })
  Tests.expect(inferred).toContain('.tao/cache/sessions/.cli/libraries/Demo')
  await Tests.expect(Exec.captureStdout('../../tao', 'compile Missing --package src/ts', { cwd: directory })).rejects
    .toThrow()
})

Tests.test('library compilation rejects path escapes and preserves files and symlinks', async () => {
  const root = Artifacts.resolvePath('tmp', 'library-output-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  await Workspace.initializeProject(root)
  const session = await Workspace.acquireSession(root)
  await Try(async () => {
    const output = Path.join(session.directory, 'libraries/Demo')
    const sentinel = output
    await FS.mkdir(Path.dirname(output))
    await FS.writeFile(sentinel, 'preserve authored data')
    const target: Workspace.CompileTarget = {
      kind: 'library',
      entry: 'unused.tao',
      target: 'Demo',
      name: '@example/library',
    }
    await Tests.expect(Workspace.publishLibrary(target, session)).rejects.toThrow('not a regular directory')
    Tests.expect(await FS.readFile(sentinel, 'utf8')).toBe('preserve authored data')
    const link = Path.join(session.directory, 'libraries/Foreign')
    await FS.symlink(output, link, 'dir')
    await Tests.expect(Workspace.publishLibrary({ ...target, target: 'Foreign' }, session)).rejects.toThrow(
      'not a regular directory',
    )
    for (const name of ['..', '.', '../Escape']) {
      await Tests.expect(Workspace.publishLibrary({ ...target, target: name }, session)).rejects.toThrow(
        'Invalid library target name',
      )
    }
    Tests.expect(await FS.readFile(sentinel, 'utf8')).toBe('preserve authored data')
  }, { finally: session.release })
})

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
  const standalone = Path.join(root, 'exported')
  await Exec.captureStdout(Repo.resolvePath('tao'), ['compile', entry, '--ts-lib', 'Two', '--out', standalone], {
    cwd: root,
  })
  const published = await FS.readFile(Path.join(standalone, 'package.json'), 'utf8')
  Tests.expect(published).toContain('"name": "two"')
  await writePreparedTaoApp(root)
  const result = await Exec.captureStdout(Repo.resolvePath('tao'), ['compile', entry, '--session', 'review-build'], {
    cwd: root,
  })
  Tests.expect(result).toContain('App.tsx')
  const build = Path.join(root, '.tao/cache/sessions/review-build/build')
  Tests.expect(FS.lstatSync(build).isSymbolicLink()).toBe(false)
  Tests.expect(await FS.readFile(Path.join(build, 'App.tsx'), 'utf8')).toContain('TR.AppDeclaration')
  await Workspace.cleanProject(root)
  Tests.expect(FS.existsSync(Path.join(build, 'App.tsx'))).toBe(false)
})

async function runRecipe(directory: string, recipe?: string): Promise<string> {
  return await Exec.captureStdout('just', ['--justfile', Path.join(directory, 'Justfile'), ...recipe ? [recipe] : []], {
    cwd: directory,
  })
}
