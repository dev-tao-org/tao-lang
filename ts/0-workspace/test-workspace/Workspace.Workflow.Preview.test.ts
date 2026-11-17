import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { initializeProject } from '../workspace-src/projects/Projects'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'
import { execute } from '../workspace-src/Workflow'
import type { WorkspaceSession } from '../workspace-src/Workspace'

type OptionalWorkspace = WorkspaceSession | undefined

Tests.test('declining or cancelling restart keeps the active preview running', async () => {
  const root = Artifacts.resolvePath('tmp', `restart-consent-${Platform.randomUUID()}`)
  const entry = Path.join(root, 'Main.tao')
  const events: string[] = []
  const request = {
    kind: 'preview' as const,
    entry,
    restart: {
      reason: 'Dependencies changed.',
      async suspend() {
        events.push('suspended')
      },
    },
  }
  let cancelled = false
  await Try(async () => {
    await initializeProject(root)
    await writeFixture(root, entry)
    await Tests.expect(execute(request, {
      async confirm() {
        events.push('declined')
        return false
      },
    })).rejects.toThrow('Dependency setup was declined.')
    await Tests.expect(execute(request, {
      async confirm() {
        events.push('cancelled')
        cancelled = true
        return true
      },
      cancelled: () => cancelled,
    })).rejects.toThrow('Workflow cancelled.')
    Tests.expect(events).toEqual(['declined', 'cancelled'])
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('invalid preview edits and changed dependencies retain last-good output', async () => {
  const root = Artifacts.resolvePath('tmp', `workflow-preview-${Platform.randomUUID()}`)
  const entry = Path.join(root, 'Main.tao')
  const published: string[] = []
  let workspace: OptionalWorkspace
  await Try(async () => {
    await initializeProject(root)
    await writeFixture(root, entry)
    workspace = await openProjectWorkspace(entry, {
      runtimeOptions: { dependencyDirectory: '/prepared-runtime' },
      async publish(app) {
        published.push(app.files['App.tsx'] ?? '')
      },
    })
    Tests.expect((await workspace.files.compileFile(entry)).status).toBe('published')
    const first = workspace.lastGoodRevision
    const requirements = Path.join(root, '@widgets/Requirements.tao')
    await FS.writeFile(requirements, 'requires npm:')
    Tests.expect((await workspace.files.compileFile(entry)).status).toBe('failed')
    Tests.expect(workspace.lastGoodRevision).toBe(first)
    await FS.writeFile(requirements, `${metadataSource}${NewlineCharacter}requires npm:fixture version 1.0.0`)
    const changed = await workspace.files.compileFile(entry)
    Tests.expect(changed.status === 'failed' && changed.setupRequired).toBe(true)
    Tests.expect(workspace.lastGoodRevision).toBe(first)
    Tests.expect(published).toHaveLength(1)
    Tests.expect(published[0]).not.toContain('Unrelated')
    await FS.writeFile(requirements, metadataSource)
    await FS.writeFile(Path.join(root, '@widgets/feature/Widget.tao'), widgetSource.replace('First', 'Second'))
    Tests.expect((await workspace.files.compileFile(entry)).status).toBe('published')
    Tests.expect(published).toHaveLength(2)
  }, {
    async finally() {
      await workspace?.dispose()
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})

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
  package view Widget { render Text("First") }
`
const metadataSource = 'package view Unrelated { render Unknown }'
