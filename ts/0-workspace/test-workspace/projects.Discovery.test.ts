import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { findNearestProjectRoot, isDiscoverableProjectDirectory } from '../workspace-src/modules/Paths'
import { discoverProject, ensureProjectMetadata, initializeProject } from '../workspace-src/projects/Projects'

Tests.test('project metadata initializes at a boundary and discovery walks upward', async () => {
  const root = temporaryProject()
  await Try(async () => {
    const layout = await initializeProject(root)
    const identity = await FS.readFile(Path.join(layout.taoDirectory, 'store', 'project.json'), 'utf8')
    await ensureProjectMetadata(root)
    Tests.expect(await FS.readFile(Path.join(layout.taoDirectory, 'store', 'project.json'), 'utf8')).toBe(identity)
    await FS.mkdir(Path.join(root, 'src'))
    Tests.expect(await discoverProject(Path.join(root, 'src', 'Main.tao'))).toEqual(layout)
    Tests.expect(await FS.readFile(Path.join(root, '.tao', '.gitignore'), 'utf8')).toBe('/cache/\n/locks/\n')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('project discovery excludes a legacy home cache but accepts durable home metadata', async () => {
  const home = Artifacts.resolvePath('tmp', `tao-fake-home-${Platform.randomUUID()}`)
  const homeAlias = `${home}-alias`
  await Try(async () => {
    const legacyTao = Path.join(home, '.tao')
    await FS.mkdirs(Path.join(legacyTao, 'cache'), Path.join(home, 'child'))
    await FS.symlink(home, homeAlias)

    Tests.expect(isDiscoverableProjectDirectory(home, homeAlias)).toBe(false)
    Tests.expect(await discoverProject(Path.join(home, 'child'), home)).toBeUndefined()
    Tests.expect(findNearestProjectRoot(Path.join(home, 'child'), home)).toBeUndefined()
    Tests.expect(findNearestProjectRoot(Path.join(homeAlias, 'child'), homeAlias)).toBeUndefined()

    await FS.mkdir(Path.join(legacyTao, 'store'))
    await FS.writeFile(Path.join(legacyTao, 'store', 'project.json'), '{}')
    Tests.expect(isDiscoverableProjectDirectory(home, homeAlias)).toBe(true)
    Tests.expect((await discoverProject(Path.join(home, 'child'), home))?.root).toBe(home)
  }, {
    async finally() {
      await FS.rm(homeAlias, { force: true })
      await FS.rm(home, { recursive: true, force: true })
    },
  })
})

Tests.test('initialization canonicalizes symlinked target ancestors before checking project parents', async () => {
  const root = temporaryProject()
  const aliases = temporaryProject()
  await Try(async () => {
    await initializeProject(root)
    const child = Path.join(root, 'child')
    await FS.mkdirs(child, aliases)
    await FS.symlink(child, Path.join(aliases, 'alias'))

    await expectFailure(() => initializeProject(Path.join(aliases, 'alias', 'nested')))
    Tests.expect(await FS.exists(Path.join(child, 'nested', '.tao'))).toBe(false)
  }, {
    async finally() {
      await FS.rm(root, { recursive: true, force: true })
      await FS.rm(aliases, { recursive: true, force: true })
    },
  })
})

Tests.test('project initialization skips nested markers reached only through directory symlinks', async () => {
  const root = temporaryProject()
  const external = temporaryProject()
  await Try(async () => {
    await FS.mkdirs(Path.join(external, '.tao'), root)
    await FS.symlink(external, Path.join(root, 'linked'))
    Tests.expect((await initializeProject(root)).root).toBe(root)
  }, {
    async finally() {
      await FS.rm(root, { recursive: true, force: true })
      await FS.rm(external, { recursive: true, force: true })
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
