import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { isDiscoverableProjectDirectory, nearestProjectRoot } from '../../workspace-src/modules/Paths'
import { discoverProject, ensureProjectMetadata, initializeProject } from '../../workspace-src/projects/Projects'

Tests.test('project metadata initializes at a boundary and discovery walks upward', async () => {
  const root = temporaryProject()
  await Try(async () => {
    const layout = await initializeProject(root)
    const identity = await FileSystem.readFile(Path.join(layout.taoDirectory, 'store', 'project.json'), 'utf8')
    await ensureProjectMetadata(root)
    Tests.expect(await FileSystem.readFile(Path.join(layout.taoDirectory, 'store', 'project.json'), 'utf8')).toBe(
      identity,
    )
    await FileSystem.mkdir(Path.join(root, 'src'), { recursive: true })
    Tests.expect(await discoverProject(Path.join(root, 'src', 'Main.tao'))).toEqual(layout)
    Tests.expect(await FileSystem.readFile(Path.join(root, '.tao', '.gitignore'), 'utf8')).toBe('cache/\nlocks/\n')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('project discovery excludes a legacy home cache but accepts durable home metadata', async () => {
  const home = Artifacts.resolvePath('tmp', `tao-fake-home-${Platform.randomUUID()}`)
  const homeAlias = `${home}-alias`
  await Try(async () => {
    const legacyTao = Path.join(home, '.tao')
    await FileSystem.mkdir(Path.join(legacyTao, 'cache'), { recursive: true })
    await FileSystem.mkdir(Path.join(home, 'child'), { recursive: true })
    await FileSystem.symlink(home, homeAlias)

    Tests.expect(isDiscoverableProjectDirectory(home, homeAlias)).toBe(false)
    Tests.expect(await discoverProject(Path.join(home, 'child'), home)).toBeUndefined()
    Tests.expect(nearestProjectRoot(Path.join(home, 'child'), home)).toBeUndefined()
    Tests.expect(nearestProjectRoot(Path.join(homeAlias, 'child'), homeAlias)).toBeUndefined()

    await FileSystem.mkdir(Path.join(legacyTao, 'store'), { recursive: true })
    await FileSystem.writeFile(Path.join(legacyTao, 'store', 'project.json'), '{}')
    Tests.expect(isDiscoverableProjectDirectory(home, homeAlias)).toBe(true)
    Tests.expect((await discoverProject(Path.join(home, 'child'), home))?.root).toBe(home)
  }, {
    async finally() {
      await FileSystem.rm(homeAlias, { force: true })
      await FileSystem.rm(home, { recursive: true, force: true })
    },
  })
})

Tests.test('initialization canonicalizes symlinked target ancestors before checking project parents', async () => {
  const root = temporaryProject()
  const aliases = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const child = Path.join(root, 'child')
    await FileSystem.mkdir(child, { recursive: true })
    await FileSystem.mkdir(aliases, { recursive: true })
    await FileSystem.symlink(child, Path.join(aliases, 'alias'))

    await expectFailure(() => initializeProject(Path.join(aliases, 'alias', 'nested')))
    Tests.expect(await FileSystem.exists(Path.join(child, 'nested', '.tao'))).toBe(false)
  }, {
    async finally() {
      await FileSystem.rm(root, { recursive: true, force: true })
      await FileSystem.rm(aliases, { recursive: true, force: true })
    },
  })
})

Tests.test('project initialization skips nested markers reached only through directory symlinks', async () => {
  const root = temporaryProject()
  const external = temporaryProject()
  await Try(async () => {
    await FileSystem.mkdir(Path.join(external, '.tao'), { recursive: true })
    await FileSystem.mkdir(root, { recursive: true })
    await FileSystem.symlink(external, Path.join(root, 'linked'))
    Tests.expect((await initializeProject(root)).root).toBe(root)
  }, {
    async finally() {
      await FileSystem.rm(root, { recursive: true, force: true })
      await FileSystem.rm(external, { recursive: true, force: true })
    },
  })
})

function temporaryProject(): string {
  return Artifacts.resolvePath('tmp', `tao-project-${Platform.randomUUID()}`)
}

async function expectFailure(action: () => Promise<unknown>): Promise<void> {
  const failed = await Try(async () => {
    await action()
    return false
  }, { catch: () => true })
  Tests.expect(failed).toBe(true)
}
