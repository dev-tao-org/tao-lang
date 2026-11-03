import { Errors, NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { buildManagedModulesInput } from '../../workspace-src/ProjectPreparation'
import { initializeProject } from '../../workspace-src/projects/Projects'
import { execute, type WorkflowWorkspace } from '../../workspace-src/Workflow'
import { createWatchFixture } from '../Watch.test-fixtures'

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
    await FS.writeFile(requirements, 'requires npm:')
    Tests.expect((await workspace.files.openFile(entry)).status).toBe('failed')
    Tests.expect(workspace.lastGoodRevision).toBe(first)
    Tests.expect(events).toEqual(['startup', 'input'])
    await FS.writeFile(requirements, `${metadataSource}${NewlineCharacter}requires npm:fixture version 1.0.0`)
    const changed = await workspace.files.openFile(entry)
    Tests.expect(changed.status === 'failed' && changed.setupRequired).toBe(true)
    Tests.expect(workspace.lastGoodRevision).toBe(first)
    Tests.expect(published).toHaveLength(1)
    Tests.expect(published[0]).not.toContain('Unrelated')
    await FS.writeFile(requirements, metadataSource)
    await FS.writeFile(Path.join(root, '@widgets/feature/Widget.tao'), widgetSource.replace('First', 'Second'))
    Tests.expect((await workspace.files.openFile(entry)).status).toBe('published')
    Tests.expect(events).toEqual(['startup', 'input', 'input'])
    Tests.expect(published).toHaveLength(2)
  }, {
    async finally() {
      await workspace?.dispose()
      await FS.rm(root, { recursive: true, force: true })
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
  await FS.mkdir(Path.join(root, '@widgets/feature'))
  await FS.writeFile(
    entry,
    S`
      use @widgets/feature Widget
      app Main { root Widget }
    `,
  )
  await FS.writeFile(Path.join(root, '@widgets/feature/Widget.tao'), widgetSource)
  await FS.writeFile(Path.join(root, '@widgets/Requirements.tao'), metadataSource)
}

const widgetSource = S`
  use tao@ui Text
  public view Widget { render Text("First") }
`
const metadataSource = 'public view Unrelated { render Unknown }'
