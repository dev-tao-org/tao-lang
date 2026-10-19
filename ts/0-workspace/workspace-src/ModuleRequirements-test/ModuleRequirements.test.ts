import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { readModuleRequirements } from '../ModuleRequirements'
import { initializeProject } from '../projects/Projects'

Tests.test('module requirements include all files under the selected module root', async () => {
  const root = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const moduleRoot = Path.join(root, '@ui')
    const selected = Path.join(moduleRoot, 'controls', 'Button.tao')
    await FileSystem.mkdir(Path.dirname(selected), { recursive: true })
    await FileSystem.mkdir(Path.join(moduleRoot, 'helpers'), { recursive: true })
    await FileSystem.writeFile(Path.join(moduleRoot, 'Dependencies.tao'), 'requires npm:alpha version 1.2.3\n')
    await FileSystem.writeFile(
      Path.join(moduleRoot, 'helpers', 'Runtime.tao'),
      'requires npm:beta version 2.3.4\n',
    )
    await FileSystem.writeFile(selected, 'requires npm:gamma version 3.4.5\n')

    const requirements = await readModuleRequirements(moduleRoot, root)

    Tests.expect(requirements.map(({ name, version, origin }) => [name, version, Path.relative(moduleRoot, origin)]))
      .toEqual([
        ['alpha', '1.2.3', 'Dependencies.tao'],
        ['gamma', '3.4.5', 'controls/Button.tao'],
        ['beta', '2.3.4', 'helpers/Runtime.tao'],
      ])
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('module requirement scans exclude nested packages, nested projects, and symlinks', async () => {
  const root = temporaryProject()
  const outside = Artifacts.resolvePath('tmp', `tao-module-outside-${Platform.randomUUID()}.tao`)
  await Try(async () => {
    await initializeProject(root)
    const moduleRoot = Path.join(root, '@ui')
    await FileSystem.mkdir(Path.join(moduleRoot, '@other'), { recursive: true })
    await FileSystem.mkdir(Path.join(moduleRoot, 'nested-project', '.tao'), { recursive: true })
    await FileSystem.writeFile(Path.join(moduleRoot, '@other', 'Other.tao'), 'requires npm:other version 1.0.0\n')
    await FileSystem.writeFile(
      Path.join(moduleRoot, 'nested-project', 'Nested.tao'),
      'requires npm:nested version 1.0.0\n',
    )
    await FileSystem.writeFile(outside, 'requires npm:outside version 1.0.0\n')
    await FileSystem.symlink(outside, Path.join(moduleRoot, 'Linked.tao'))
    await FileSystem.writeFile(Path.join(moduleRoot, 'Dependencies.tao'), 'requires npm:inside version 1.0.0\n')

    const requirements = await readModuleRequirements(moduleRoot, root)

    Tests.expect(requirements.map(requirement => requirement.name)).toEqual(['inside'])
  }, {
    async finally() {
      await FileSystem.rm(root, { recursive: true, force: true })
      await FileSystem.rm(outside, { force: true })
    },
  })
})

Tests.test('module scans reject non-npm requirements and unpinned npm requirements', async () => {
  const root = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const moduleRoot = Path.join(root, '@ui')
    await FileSystem.mkdir(moduleRoot, { recursive: true })
    const source = Path.join(moduleRoot, 'Dependencies.tao')
    await FileSystem.writeFile(source, 'requires bundled:tao version v2\n')

    await expectFailure(() => readModuleRequirements(moduleRoot, root))

    await FileSystem.writeFile(source, 'requires npm:alpha version ^1.2.3\n')
    await expectFailure(() => readModuleRequirements(moduleRoot, root))
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

function temporaryProject(): string {
  return Artifacts.resolvePath('tmp', `tao-module-requirements-${Platform.randomUUID()}`)
}

async function expectFailure(operation: () => Promise<unknown>): Promise<void> {
  const failed = await Try(async () => {
    await operation()
    return false
  }, { catch: () => true })
  Tests.expect(failed).toBe(true)
}
