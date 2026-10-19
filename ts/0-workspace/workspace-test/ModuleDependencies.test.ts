import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import {
  addModuleNpmDependency,
  findPreparationEntry,
  withDependencySession,
} from '../workspace-src/ModuleDependencies'

Tests.test('module add replaces an existing npm declaration and preserves its alias', async () => {
  const root = tempRoot()
  const module = Path.join(root, 'Packages', '@widgets')
  const source = Path.join(module, 'Views.tao')
  await Try(async () => {
    await FileSystem.mkdir(module, { recursive: true })
    await FileSystem.writeFile(Path.join(root, '.tao'), '')
    await FileSystem.writeFile(source, 'requires npm:@scope/graph version 1.2.3 as graph\n')
    const result = await addModuleNpmDependency(root, '@widgets', '@scope/graph@2.4.1')
    Tests.expect(result).toEqual({
      moduleRoot: module,
      sourcePath: source,
      packageName: '@scope/graph',
      version: '2.4.1',
    })
    Tests.expect(await FileSystem.readFile(source, 'utf8')).toBe(
      'requires npm:@scope/graph version 2.4.1 as graph\n',
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('module add resolves bare packages through the injected executor and appends conventionally', async () => {
  const root = tempRoot()
  const module = Path.join(root, 'Packages', '@widgets')
  let asked = ''
  await Try(async () => {
    await FileSystem.mkdir(module, { recursive: true })
    await FileSystem.writeFile(Path.join(root, '.tao'), '')
    const result = await addModuleNpmDependency(root, '@widgets', 'date-fns', async (name, cwd) => {
      asked = `${name}:${cwd}`
      return '4.1.0'
    })
    Tests.expect(asked).toBe(`date-fns:${root}`)
    Tests.expect(result.sourcePath).toBe(Path.join(module, 'Dependencies.tao'))
    Tests.expect(await FileSystem.readFile(result.sourcePath, 'utf8')).toBe(
      'requires npm:date-fns version 4.1.0\n',
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('module add rejects ambiguous local names and invalid versions', async () => {
  const root = tempRoot()
  const unique = tempRoot()
  await Try(async () => {
    await FileSystem.mkdir(Path.join(root, 'One', '@widgets'), { recursive: true })
    await FileSystem.mkdir(Path.join(root, 'Two', '@widgets'), { recursive: true })
    await FileSystem.writeFile(Path.join(root, '.tao'), '')
    await FileSystem.mkdir(Path.join(unique, 'One', '@widgets'), { recursive: true })
    await FileSystem.writeFile(Path.join(unique, '.tao'), '')
    await Tests.rejects(addModuleNpmDependency(unique, '@widgets', 'lodash@^4.0.0'), /exact semantic version/)
    await Tests.rejects(addModuleNpmDependency(root, '@widgets', 'lodash@4.0.0'), /ambiguous/)
  }, { finally: () => cleanRoots(root, unique) })
})

Tests.test('prepare entry discovery picks one app and releases injected cache lease', async () => {
  const root = tempRoot()
  let released = false
  await Try(async () => {
    await FileSystem.mkdir(Path.join(root, '.tao'), { recursive: true })
    const entry = Path.join(root, 'Main.tao')
    await FileSystem.writeFile(entry, 'app Main { root Main }')
    Tests.expect(await findPreparationEntry(root)).toBe(entry)
    const result = await withDependencySession(root, 'test-session', async () => 'prepared', async identity => {
      Tests.expect(identity).toBe(`project:${root}:session:test-session`)
      return () => {
        released = true
      }
    })
    Tests.expect(result).toBe('prepared')
    Tests.expect(released).toBe(true)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

function tempRoot(): string {
  return Artifacts.resolvePath('tmp', `module-dependencies-${Platform.randomUUID()}`)
}

async function cleanRoots(...roots: string[]): Promise<void> {
  for (const root of roots) {
    await FileSystem.rm(root, { recursive: true, force: true })
  }
}
