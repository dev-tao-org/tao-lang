import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { initializeProject } from '../workspace-src/projects/Projects'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'
import { createWorkspace, Document } from '../workspace-src/Workspace'

Tests.test('file compilation and document updates link an aliased entry with its canonical sources', async () => {
  const root = Artifacts.resolvePath('tmp', `entry-identity-${Platform.randomUUID()}`)
  const alias = root + '-alias'
  await initializeProject(root)
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  await FileSystem.writeFile(Path.join(root, 'Main.tao'), source)
  await FileSystem.symlink(root, alias, 'dir')
  const workspace = createWorkspace({ directory: alias, async publish() {} })
  await Try(async () => {
    Tests.expect(await workspace.files.compileFile(Path.join(alias, 'Main.tao'))).toMatchObject({ status: 'published' })
    Tests.expect(await workspace.update(new Document(Path.join(alias, 'Main.tao'), source)))
      .toMatchObject({ status: 'published' })
  }, {
    async finally() {
      await workspace.dispose()
      await FileSystem.rm(alias, { force: true })
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('managed preview accepts an aliased entry inside its canonical discovered project', async () => {
  const root = Artifacts.resolvePath('tmp', `managed-entry-identity-${Platform.randomUUID()}`)
  const alias = root + '-alias'
  await initializeProject(root)
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  await FileSystem.writeFile(Path.join(root, 'Main.tao'), source)
  await FileSystem.symlink(root, alias, 'dir')
  const entry = Path.join(alias, 'Main.tao')
  const workspace = await openProjectWorkspace(entry, {
    async publish() {},
    runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime') },
    watch: async () => ({ async dispose() {} }),
  })
  await Try(async () => {
    Tests.expect(await workspace.openFile(entry)).toMatchObject({ status: 'published' })
    Tests.expect(workspace.files.entryPath).toBe(Path.join(root, 'Main.tao'))
  }, {
    async finally() {
      await workspace.dispose()
      await FileSystem.rm(alias, { force: true })
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})
