import { Time, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FileWatch, FS, Path, Platform, Repo } from '@shared/os'
import { FileManager } from '../workspace-src/FileManager/FileManager'
import { initializeProject } from '../workspace-src/projects/Projects'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'
import { createWorkspace, Document } from '../workspace-src/Workspace'

Tests.test('file compilation and document updates link an aliased entry with its canonical sources', async () => {
  const root = Artifacts.resolvePath('tmp', `entry-identity-${Platform.randomUUID()}`)
  const alias = root + '-alias'
  await initializeProject(root)
  const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
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
  const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
  await FS.writeFile(Path.join(root, 'Main.tao'), source)
  await FS.symlink(root, alias, 'dir')
  const entry = Path.join(alias, 'Main.tao')
  const workspace = await openProjectWorkspace(entry, {
    async publish() {},
    runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime') },
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

type OptionalWatchChangeHandler = ((change: FileWatch.FileChange) => void) | undefined

Tests.test('aliased output exclusions retain canonical identity before generated directories exist', async () => {
  const root = Artifacts.resolvePath('tmp', `output-identity-${Platform.randomUUID()}`)
  const alias = root + '-alias'
  await FS.mkdir(root)
  await FS.writeFile(Path.join(root, 'Main.tao'), 'source')
  await FS.symlink(root, alias, 'dir')
  let ignored: readonly string[] = []
  let notify: OptionalWatchChangeHandler
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
    compile: async () => ({
      status: 'published',
      revision: 'fixture',
      timings: [],
      stages: {
        typecheck: { stage: 'typecheck', status: 'skipped' },
        fix: { stage: 'fix', status: 'skipped' },
        check: { stage: 'check', status: 'skipped' },
      },
    }),
  })
  await Try(async () => {
    await manager.openFile('Main.tao')
    Tests.expect(await FS.exists(output)).toBe(false)
    Tests.expect(ignored).toEqual([output])
    notify!({ path: Path.join(output, 'build/App.tsx'), kind: 'change', observedAtMs: Time.timestampMs() })
  }, {
    async finally() {
      await manager.dispose()
      await FS.rm(alias, { force: true })
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})
