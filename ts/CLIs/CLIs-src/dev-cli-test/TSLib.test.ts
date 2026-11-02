import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { resolveCompileTarget } from '@workspace/CompileTarget'
import { initializeProject } from '@workspace/projects/Projects'
import { publishLibrary } from '@workspace/PublishLibrary'
import { createStandaloneLibraryFixture } from '../../../0-workspace/workspace-test/StandaloneLibrary'
import { writePreparedTaoApp } from './TaoAppFixture'

Tests.test('standalone TS-Lib Justfile compiles repeatedly and checks its authored consumer from its directory', async () => {
  const directory = await createStandaloneLibraryFixture()
  const menu = await runRecipe(directory)
  Tests.expect(menu).toContain('compile')
  Tests.expect(menu).toContain('run')
  Tests.expect(menu).toContain('check')
  Tests.expect(menu).toContain('test')
  const output = Path.join(directory, '.tao/cache/libraries/Demo')
  await runRecipe(directory, 'compile')
  const first = FileSystem.realpathSync(output)
  await runRecipe(directory, 'compile')
  const second = FileSystem.realpathSync(output)
  Tests.expect(first).not.toBe(second)
  Tests.expect(FileSystem.existsSync(Path.join(first, 'package.json'))).toBe(true)
  Tests.expect(FileSystem.existsSync(Path.join(second, 'package.json'))).toBe(true)
  const packageDirectory = Path.join(directory, 'src/ts')
  Tests.expect(FileSystem.realpathSync(Path.join(packageDirectory, 'node_modules/@example/tao-library'))).toBe(second)
  Tests.expect(FileSystem.resolveModule('@example/tao-library/Greeting', packageDirectory)).toBe(
    Path.join(second, 'view0.js'),
  )
  await runRecipe(directory, 'check')
  const inferred = await Platform.capture('../../tao compile --package src/ts', { cwd: directory })
  Tests.expect(inferred).toContain('.tao/cache/libraries/Demo')
  await Tests.expect(Platform.capture('../../tao compile Missing --package src/ts', { cwd: directory })).rejects
    .toThrow()
})

Tests.test('library compilation preserves unrelated existing output directories and links', async () => {
  const root = Artifacts.resolvePath('tmp', 'library-output-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  const output = Path.join(root, 'output')
  const sentinel = Path.join(output, 'authored.txt')
  await FileSystem.mkdir(output)
  await FileSystem.writeFile(sentinel, 'preserve authored data')
  const request = { entry: 'unused.tao', out: output, name: '@example/library' }
  await Tests.expect(publishLibrary(request)).rejects.toThrow('not owned')
  Tests.expect(await FileSystem.readFile(sentinel, 'utf8')).toBe('preserve authored data')
  const link = Path.join(root, 'foreign-link')
  await FileSystem.symlink(output, link, 'dir')
  await Tests.expect(publishLibrary(createLinkedOutputRequest(request, link))).rejects.toThrow('unrelated data')
  Tests.expect(await FileSystem.readFile(sentinel, 'utf8')).toBe('preserve authored data')
})

function createLinkedOutputRequest(request: Parameters<typeof publishLibrary>[0], out: string) {
  return { ...request, out }
}

Tests.test('unified compile rejects unknown and ambiguous targets and still compiles an explicit app entry', async () => {
  const root = Artifacts.resolvePath('tmp', 'compile-target-' + Platform.randomUUID())
  Artifacts.trackTemporary(root)
  await initializeProject(root)
  const entry = Path.join(root, 'Main.tao')
  await FileSystem.writeFile(entry, 'ts-library One { publish { } }\nts-library Two { publish { } }')
  await FileSystem.writeFile(
    Path.join(root, 'package.json'),
    JSON.stringify({ name: 'compile-target-fixture', tao: { compile: { entry: 'Main.tao' } } }),
  )
  await Tests.expect(resolveCompileTarget(root)).rejects.toThrow('found 2 matching targets')
  await Tests.expect(resolveCompileTarget(root, 'Missing')).rejects.toThrow('found 0 matching targets')
  Tests.expect((await resolveCompileTarget(root, 'Two')).target).toBe('Two')
  await writePreparedTaoApp(root)
  const result = await Platform.capture(Repo.resolvePath('tao'), { variadicArgs: ['compile', entry], cwd: root })
  Tests.expect(result).toContain('App.tsx')
})

async function runRecipe(directory: string, recipe?: string): Promise<string> {
  return await Platform.capture('just --justfile', {
    variadicArgs: [Path.join(directory, 'Justfile'), ...recipe ? [recipe] : []],
    cwd: directory,
  })
}
