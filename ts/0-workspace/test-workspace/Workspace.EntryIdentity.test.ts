import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo, WorkspaceWatch } from '@shared/os'
import { FileManager } from '../workspace-src/FileManager/FileManager'
import { initializeProject } from '../workspace-src/projects/Projects'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'
import { createWorkspace, Document } from '../workspace-src/Workspace'
import { createUpdateResult } from './FileManager.test-fixtures.Watch'

Tests.test('file compilation and document updates link an aliased entry with its canonical sources', async () => {
  const root = Artifacts.resolvePath('tmp', `entry-identity-${Platform.randomUUID()}`)
  const alias = root + '-alias'
  await initializeProject(root)
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  await FS.writeFile(Path.join(root, 'Main.tao'), source)
  await FS.symlink(root, alias, 'dir')
  const workspace = createWorkspace({ directory: alias, async publish() {} })
  await Try(async () => {
    Tests.expect(await workspace.files.compileFile(Path.join(alias, 'Main.tao'))).toMatchObject({ status: 'published' })
    Tests.expect(await workspace.update(new Document(Path.join(alias, 'Main.tao'), source)))
      .toMatchObject({ status: 'published' })
  }, {
    async finally() {
      await workspace.dispose()
      await FS.rm(alias, { force: true })
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})

Tests.test('managed preview accepts an aliased entry inside its canonical discovered project', async () => {
  const root = Artifacts.resolvePath('tmp', `managed-entry-identity-${Platform.randomUUID()}`)
  const alias = root + '-alias'
  await initializeProject(root)
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  await FS.writeFile(Path.join(root, 'Main.tao'), source)
  await FS.symlink(root, alias, 'dir')
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
      await FS.rm(alias, { force: true })
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})

type OptionalWatchChangeHandler = ((change: WorkspaceWatch.WorkspaceChange) => void) | undefined

Tests.test('aliased output exclusions retain canonical identity before generated directories exist', async () => {
  const root = Artifacts.resolvePath('tmp', `output-identity-${Platform.randomUUID()}`)
  const alias = root + '-alias'
  await FS.mkdir(root)
  await FS.writeFile(Path.join(root, 'Main.tao'), 'source')
  await FS.symlink(root, alias, 'dir')
  let notify: OptionalWatchChangeHandler
  let ignored: readonly string[] = []
  let scheduled = 0
  const output = Path.join(root, 'generated/deeper')
  const manager = new FileManager({
    directory: alias,
    outputDirectory: Path.join(alias, 'generated/deeper'),
    async watch(directory, onChange, _error, exclusions) {
      Tests.expect(directory).toBe(root)
      notify = onChange
      ignored = exclusions ?? []
      return { async dispose() {} }
    },
    schedule() {
      scheduled++
      return () => {}
    },
    compile: async () => createUpdateResult('published'),
  })
  await Try(async () => {
    await manager.openFile('Main.tao')
    Tests.expect(await FS.exists(output)).toBe(false)
    for (const path of [Path.join(output, 'build/App.tsx'), Path.join(output, 'state.json'), output]) {
      notify!({ path, kind: path === output ? 'addDir' : 'change', observedAtMs: 0 })
    }
    Tests.expect(scheduled).toBe(0)
    Tests.expect(ignored).toEqual([output])
    notify!({ path: Path.join(root, 'Main.tao'), kind: 'change', observedAtMs: 0 })
    Tests.expect(scheduled).toBe(1)
  }, {
    async finally() {
      await manager.dispose()
      await FS.rm(alias, { force: true })
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})
