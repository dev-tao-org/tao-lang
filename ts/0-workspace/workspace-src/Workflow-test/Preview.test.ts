import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { createWatchFixture } from '../../workspace-test/WatchFixture'
import { buildManagedModulesInput } from '../ProjectPreparation'
import { initializeProject } from '../projects/Projects'
import { execute, type WorkflowWorkspace } from '../Workflow'

type OptionalWorkflowWorkspace = WorkflowWorkspace | undefined

Tests.test('unchanged and partial preview edits never inspect setup or install and retain last-good output', async () => {
  const root = Artifacts.resolvePath('tmp', `workflow-preview-${Platform.randomUUID()}`)
  const entry = Path.join(root, 'Main.tao')
  const events: string[] = []
  const published: string[] = []
  let workspace: OptionalWorkflowWorkspace
  await Try(async () => {
    await initializeProject(root)
    await writeFixture(root, entry)
    workspace = await openPreview(entry, events, published)
    const first = workspace.lastGoodRevision
    const requirements = Path.join(root, '@widgets/Requirements.tao')
    await FileSystem.writeFile(requirements, 'requires npm:')
    Tests.expect((await workspace.files.openFile(entry)).status).toBe('failed')
    Tests.expect(workspace.lastGoodRevision).toBe(first)
    Tests.expect(events).toEqual(['startup', 'input'])
    await FileSystem.writeFile(requirements, `${metadataSource}\nrequires npm:fixture version 1.0.0`)
    const changed = await workspace.files.openFile(entry)
    Tests.expect(changed.status === 'failed' && changed.setupRequired).toBe(true)
    Tests.expect(workspace.lastGoodRevision).toBe(first)
    Tests.expect(published).toHaveLength(1)
    Tests.expect(published[0]).not.toContain('Unrelated')
    await FileSystem.writeFile(requirements, metadataSource)
    await FileSystem.writeFile(Path.join(root, '@widgets/feature/Widget.tao'), widgetSource.replace('First', 'Second'))
    Tests.expect((await workspace.files.openFile(entry)).status).toBe('published')
    Tests.expect(events).toEqual(['startup', 'input', 'input'])
    Tests.expect(published).toHaveLength(2)
  }, {
    async finally() {
      await workspace?.dispose()
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

async function openPreview(entry: string, events: string[], published: string[]): Promise<WorkflowWorkspace> {
  return await execute(
    {
      kind: 'preview',
      entry,
      options: {
        ...createWatchFixture().options,
        acquireLease: async () => () => {},
        runtimeOptions: { dependencyDirectory: '/prepared-runtime' },
        async publish(app) {
          published.push(app.files['App.tsx'] ?? '')
        },
        pipelineServices: {
          async buildManagedInput(directory, program) {
            events.push('input')
            return await buildManagedModulesInput(directory, program.modules, {})
          },
          readManaged: async () =>
            Errors.ThrowShouldNeverHappen('No managed profile should be inspected on this session.'),
          inspectGeneratedFiles: async () => Errors.ThrowShouldNeverHappen('No generated setup scan should run.'),
          prepareSidecars: async () => Errors.ThrowShouldNeverHappen('No sidecar should be installed.'),
        },
      },
    },
    { confirm: async () => Errors.ThrowShouldNeverHappen('An ordinary edit must not prompt.') },
    {
      async inspect() {
        events.push('startup')
      },
      setup: async () => Errors.ThrowShouldNeverHappen('An ordinary edit must not install.'),
    },
  )
}

async function writeFixture(root: string, entry: string): Promise<void> {
  await FileSystem.mkdir(Path.join(root, '@widgets/feature'), { recursive: true })
  await FileSystem.writeFile(entry, 'use Widget from @widgets/feature\napp Main { root Widget }')
  await FileSystem.writeFile(Path.join(root, '@widgets/feature/Widget.tao'), widgetSource)
  await FileSystem.writeFile(Path.join(root, '@widgets/Requirements.tao'), metadataSource)
}

const widgetSource = 'use Text from tao@ui\npublic view Widget { render Text("First") }'
const metadataSource = 'public view Unrelated { render Unknown }'
