import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as ModuleDependencies from '../workspace-src/ModuleDependencies'

const ExactSemanticVersionRequiredErrorRegx = /exact semantic version/
const AmbiguousPackageNameErrorRegx = /ambiguous/
const DependencySessionAlreadyActiveErrorRegx = /session is already active/

Tests.test('module add replaces an existing npm declaration and preserves its alias', async () => {
  const root = tempRoot()
  const module = Path.join(root, 'Packages', '@widgets')
  const source = Path.join(module, 'Views.tao')
  await Try(async () => {
    await FS.mkdir(module)
    await FS.writeFile(Path.join(root, '.tao'), '')
    await FS.writeFile(source, 'requires npm:@scope/graph version 1.2.3 as Graph' + NewlineCharacter)
    const result = await ModuleDependencies.addModuleNpmDependency(root, '@widgets', '@scope/graph@2.4.1')
    Tests.expect(result).toEqual({
      moduleRoot: module,
      sourcePath: source,
      packageName: '@scope/graph',
      version: '2.4.1',
    })
    Tests.expect(await FS.readFile(source, 'utf8')).toBe('requires npm:@scope/graph version 2.4.1 as Graph\n')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('module add resolves bare packages through the injected executor and appends conventionally', async () => {
  const root = tempRoot()
  const module = Path.join(root, 'Packages', '@widgets')
  let asked = ''
  await Try(async () => {
    await FS.mkdir(module)
    await FS.writeFile(Path.join(root, '.tao'), '')
    const result = await ModuleDependencies.addModuleNpmDependency(root, '@widgets', 'date-fns', async (name, cwd) => {
      asked = `${name}:${cwd}`
      return '4.1.0'
    })
    Tests.expect(asked).toBe(`date-fns:${root}`)
    Tests.expect(result.sourcePath).toBe(Path.join(module, 'Dependencies.tao'))
    Tests.expect(await FS.readFile(result.sourcePath, 'utf8')).toBe('requires npm:date-fns version 4.1.0\n')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('module add accepts legacy mixed-case npm package names', async () => {
  const root = tempRoot()
  const module = Path.join(root, 'Packages', '@widgets')
  await Try(async () => {
    await FS.mkdir(module)
    await FS.writeFile(Path.join(root, '.tao'), '')
    const result = await ModuleDependencies.addModuleNpmDependency(root, '@widgets', 'JSONStream@1.3.5')
    Tests.expect(result.packageName).toBe('JSONStream')
    Tests.expect(await FS.readFile(result.sourcePath, 'utf8'))
      .toBe('requires npm:JSONStream version 1.3.5\n')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('module add rejects ambiguous local names and invalid versions', async () => {
  const root = tempRoot()
  const unique = tempRoot()
  await Try(async () => {
    await FS.mkdirs(Path.join(root, 'One', '@widgets'), Path.join(root, 'Two', '@widgets'))
    await FS.writeFile(Path.join(root, '.tao'), '')
    await FS.mkdir(Path.join(unique, 'One', '@widgets'))
    await FS.writeFile(Path.join(unique, '.tao'), '')
    await Tests.rejects(
      ModuleDependencies.addModuleNpmDependency(unique, '@widgets', 'lodash@^4.0.0'),
      ExactSemanticVersionRequiredErrorRegx,
    )
    await Tests.rejects(
      ModuleDependencies.addModuleNpmDependency(root, '@widgets', 'lodash@4.0.0'),
      AmbiguousPackageNameErrorRegx,
    )
  }, { finally: () => cleanRoots(root, unique) })
})

Tests.test('prepare entry discovery picks one app', async () => {
  const root = tempRoot()
  await Try(async () => {
    await FS.mkdir(Path.join(root, '.tao'))
    const entry = Path.join(root, 'Main.tao')
    await FS.writeFile(entry, 'app Main { root Main }')
    Tests.expect(await ModuleDependencies.findPreparationEntry(root)).toBe(entry)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('dependency session rejects concurrent work and releases its locks afterward', async () => {
  const root = tempRoot()
  await Try(async () => {
    await FS.mkdir(Path.join(root, '.tao'))
    await ModuleDependencies.withDependencySession(root, 'busy', async () => {
      await Tests.rejects(
        ModuleDependencies.withDependencySession(root, 'busy', async () => {}),
        DependencySessionAlreadyActiveErrorRegx,
      )
    })
    await ModuleDependencies.withDependencySession(root, 'busy', async () => {})
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

function tempRoot(): string {
  return Artifacts.resolvePath('tmp', `module-dependencies-${Platform.randomUUID()}`)
}

async function cleanRoots(...roots: string[]): Promise<void> {
  for (const root of roots) {
    await FS.rm(root, { recursive: true, force: true })
  }
}
