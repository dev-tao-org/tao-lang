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

Tests.test('library compile requests consumer setup and repairs missing dependencies after consent', async () => {
  const root = await WorkspaceTests.createStandaloneLibraryFixture()
  const consumer = Path.join(root, 'src/ts')
  const dependency = Path.join(consumer, 'local-fixture')
  const runtime = Path.join(consumer, 'local-runtime')
  const modules = Path.join(consumer, 'node_modules')
  await FS.rm(modules, { recursive: true, force: true })
  await FS.mkdirs(dependency, runtime)
  await FS.writeFile(Path.join(dependency, 'package.json'), '{"name":"local-fixture","version":"1.0.0"}')
  await FS.writeFile(Path.join(runtime, 'package.json'), '{"name":"@tao/runtime","version":"0.0.0"}')
  await FS.writeFile(
    Path.join(consumer, 'package.json'),
    Json.Print({
      name: 'consumer-fixture',
      tao: { compile: { entry: '../tao/Library.tao', name: '@tao-dev/ts-lib-example' } },
      dependencies: {
        'local-fixture': 'file:./local-fixture',
        '@tao/runtime': 'file:./local-runtime',
        '@tao-dev/ts-lib-example': 'file:../../.tao/cache/sessions/.cli/libraries/Demo',
      },
    }),
  )
  const args = ['compile', 'Demo', '--package', consumer]
  const cli = Repo.resolvePath('tao')
  await verifyInvalidRunDoesNotInstall(cli, root, consumer)
  const cold = await Exec.capture(cli, args, { cwd: root, stdin: 'ignore', check: false })
  Tests.expect(cold.status).toBe(1)
  Tests.expect(cold.stdout + cold.stderr).toContain('Pass --yes')
  await Exec.captureStdout(cli, [...args, '--yes'], { cwd: root })
  const output = Path.join(root, '.tao/cache/sessions/.cli/libraries/Demo')
  Tests.expect(FS.realpathSync(Path.join(output, 'node_modules'))).toBe(FS.realpathSync(modules))
  await verifyExistingLinkedInstall(root, consumer, runtime)
  await verifyRefreshedLocalPackages(root, consumer, runtime)
  await verifyLocalGraphChangeNeedsConsent(root, consumer, runtime)
  const lock = Path.join(consumer, 'bun.lock')
  await FS.writeFile(lock, (await FS.readFile(lock, 'utf8')) + '\n')
  const changed = await Exec.capture(cli, args, { cwd: root, stdin: 'ignore', check: false })
  Tests.expect(changed.stdout + changed.stderr).toContain('Pass --yes')
  await Exec.captureStdout(cli, [...args, '--yes'], { cwd: root })
  await FS.rm(Path.join(modules, 'local-fixture'), { recursive: true, force: true })
  const missing = await Exec.capture(cli, args, { cwd: root, stdin: 'ignore', check: false })
  Tests.expect(missing.status).toBe(1)
}, { timeout: 10_000 })

Tests.test('library compile reuses an installed runtime tarball while its bytes are unchanged', async () => {
  const root = await WorkspaceTests.createStandaloneLibraryFixture()
  const consumer = Path.join(root, 'src/ts')
  const packageDirectory = Path.join(consumer, 'package')
  const modules = Path.join(consumer, 'node_modules')
  await FS.rm(modules, { recursive: true, force: true })
  await FS.mkdir(packageDirectory)
  await FS.writeJson(Path.join(packageDirectory, 'package.json'), { name: '@tao/runtime', version: '0.0.0' })
  await Exec.captureStdout('tar', ['-czf', 'runtime.tgz', 'package'], { cwd: consumer })
  await FS.writeJson(Path.join(consumer, 'package.json'), {
    name: 'consumer-tarball-fixture',
    tao: { compile: { entry: '../tao/Library.tao', name: '@tao-dev/ts-lib-example' } },
    dependencies: { '@tao/runtime': 'file:./runtime.tgz' },
  })
  const cli = Repo.resolvePath('tao')
  const args = ['compile', 'Demo', '--package', consumer]
  await Exec.captureStdout(cli, [...args, '--yes'], { cwd: root })
  Tests.expect(await Exec.captureStdout(cli, args, { cwd: root })).toContain('/libraries/Demo')
})

async function verifyExistingLinkedInstall(root: string, consumer: string, runtime: string): Promise<void> {
  const modules = Path.join(consumer, 'node_modules')
  const manifest = Path.join(modules, '@tao/runtime/package.json')
  await FS.rm(manifest)
  await FS.symlink(Path.join(runtime, 'package.json'), manifest)
  const lock = Path.join(consumer, 'bun.lock')
  const lockContents = await FS.readFile(lock)
  const receipt = Path.join(modules, '.tao-consumer-install')
  const receiptContents = await FS.readFile(receipt)
  await FS.rm(lock)
  await FS.rm(receipt)
  await verifyUnrecordedInstallDetectsDependencyChange(root, consumer)
  await Exec.captureStdout(Repo.resolvePath('tao'), ['compile', 'Demo', '--package', consumer], { cwd: root })
  Tests.expect(FS.existsSync(lock)).toBe(false)
  await FS.writeFile(lock, lockContents)
  await FS.writeFile(receipt, receiptContents)
}

async function verifyInvalidRunDoesNotInstall(cli: string, root: string, consumer: string): Promise<void> {
  const args = ['run', '--package', consumer, '--yes']
  const options = { cwd: root, check: false }
  const missing = await Exec.capture(cli, args, options)
  Tests.expect(missing.status).toBe(1)
  Tests.expect(missing.stdout + missing.stderr).toContain('Configure tao.run.entry')
  const manifest = Path.join(consumer, 'package.json')
  const original = await FS.readFile(manifest, 'utf8')
  await FS.writeFile(manifest, original.replace('"compile":', '"run": { "entry": "../outside.tsx" }, "compile":'))
  await Try(async () => {
    const invalid = await Exec.capture(cli, args, options)
    Tests.expect(invalid.status).toBe(1)
    Tests.expect(invalid.stdout + invalid.stderr).toContain('tao.run.entry must name an existing component')
    Tests.expect(FS.existsSync(Path.join(consumer, 'node_modules'))).toBe(false)
  }, { finally: () => FS.writeFile(manifest, original) })
}

async function verifyLocalGraphChangeNeedsConsent(root: string, consumer: string, runtime: string): Promise<void> {
  const manifest = Path.join(runtime, 'package.json')
  const graphPackage = Path.join(consumer, 'local-graph-fixture')
  await FS.mkdir(graphPackage)
  await FS.writeJson(Path.join(graphPackage, 'package.json'), { name: 'local-graph-fixture', version: '1.0.0' })
  await FS.writeJson(manifest, {
    name: '@tao/runtime',
    version: '0.0.0',
    dependencies: { 'local-graph-fixture': `file:${graphPackage}` },
  })
  const cli = Repo.resolvePath('tao')
  const args = ['compile', 'Demo', '--package', consumer]
  const result = await Exec.capture(cli, args, { cwd: root, stdin: 'ignore', check: false })
  Tests.expect(result.status).toBe(1)
  Tests.expect(result.stdout + result.stderr).toContain('Pass --yes')
  await Exec.captureStdout(cli, [...args, '--yes'], { cwd: root })
  const installed = Path.join(consumer, 'node_modules/@tao/runtime')
  Tests.expect(FS.resolvePackageDirectory('local-graph-fixture', installed)).toBeDefined()
}

async function verifyUnrecordedInstallDetectsDependencyChange(root: string, consumer: string): Promise<void> {
  const manifest = Path.join(consumer, 'package.json')
  const original = await FS.readFile(manifest, 'utf8')
  await FS.writeFile(manifest, original.replace('file:./local-fixture', 'file:./new-local-fixture'))
  await Try(async () => {
    const args = ['compile', 'Demo', '--package', consumer]
    const result = await Exec.capture(Repo.resolvePath('tao'), args, { cwd: root, stdin: 'ignore', check: false })
    Tests.expect(result.status).toBe(1)
    Tests.expect(result.stdout + result.stderr).toContain('Pass --yes')
  }, { finally: () => FS.writeFile(manifest, original) })
}

async function verifyRefreshedLocalPackages(root: string, consumer: string, runtime: string): Promise<void> {
  const source = Path.join(root, 'src/tao/Library.tao')
  const authored = await FS.readFile(source, 'utf8')
  await FS.writeFile(source, authored.replace('Nested private Tao helper', 'Refreshed helper'))
  const cli = Repo.resolvePath('tao')
  const args = ['compile', 'Demo', '--package', consumer]
  await Exec.captureStdout(cli, args, { cwd: root })
  const modules = Path.join(consumer, 'node_modules')
  const installed = Path.join(modules, '@tao-dev/ts-lib-example/ts/packages/src/tao/Library.views.tsx')
  Tests.expect(await FS.readFile(installed, 'utf8')).toContain('Refreshed helper')
  await FS.writeFile(Path.join(runtime, 'updated.ts'), 'export const updated = true')
  await Exec.captureStdout(cli, args, { cwd: root })
  Tests.expect(await FS.readFile(Path.join(modules, '@tao/runtime/updated.ts'), 'utf8')).toContain('updated')
}

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
  await FS.writeJson(Path.join(root, 'package.json'), { private: true, tao: { run: false } })
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
