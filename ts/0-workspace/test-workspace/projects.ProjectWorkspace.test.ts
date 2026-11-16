import * as Runtime from '@runtime'
import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { createProjectDependencyOptions } from '../workspace-src/dependencies/Options'
import { prepareDependencies } from '../workspace-src/dependencies/Store'
import { initializeProject } from '../workspace-src/projects/Projects'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'
import type { WorkspaceSession } from '../workspace-src/Workspace'

Tests.test('project workspaces isolate named outputs and retain exclusive ownership until disposal', async () => {
  const root = Artifacts.resolvePath('tmp', `project-workspace-${Platform.randomUUID()}`)
  const workspaces: WorkspaceSession[] = []
  await Try(() => verifyProjectWorkspaces(root, workspaces), {
    finally: () => disposeProjectWorkspaces(root, workspaces),
  })
})

async function verifyProjectWorkspaces(
  root: string,
  workspaces: WorkspaceSession[],
): Promise<void> {
  const entry = await createProjectEntry(root)
  const runtimeOptions = await prepareLocalRuntime(root)
  const options = { async publish() {}, runtimeOptions }
  const first = await openProjectWorkspace(entry, { ...options, id: 'one' })
  workspaces.push(first)
  const busy = await Try(() => openProjectWorkspace(entry, { ...options, id: 'one' }), { catch: () => undefined })
  Tests.expect(busy).toBeUndefined()
  const second = await openProjectWorkspace(entry, { ...options, id: 'two' })
  workspaces.push(second)
  Tests.expect((await first.files.compileFile(entry)).status).toBe('published')
  Tests.expect((await second.files.compileFile(entry)).status).toBe('published')
  await first.dispose()
  const warm = await openProjectWorkspace(entry, { ...options, id: 'one' })
  workspaces.push(warm)
  Tests.expect((await warm.files.compileFile(entry)).status).toBe('published')
}

async function createProjectEntry(root: string): Promise<string> {
  await initializeProject(root)
  const entry = Path.join(root, 'Main.tao')
  await FS.writeFile(
    entry,
    S`
      use tao@ui Text
      app Main { root Greeting }
      view Greeting { render Text("Hi") }
    `,
  )
  const dependencies = await createProjectDependencyOptions(root)
  await prepareDependencies(root, await dependencies.readRequirements(root), dependencies)
  return entry
}

async function prepareLocalRuntime(root: string): Promise<{
  toolchainCacheDirectory: string
  install: Runtime.RuntimeInstaller
}> {
  const runtimeOptions = {
    toolchainCacheDirectory: Path.join(root, 'runtime-toolchains'),
    install: {
      async install(directory: string) {
        await FS.mkdir(Path.join(directory, 'node_modules'))
      },
    },
  }
  await Runtime.prepareRuntime(runtimeOptions)
  return runtimeOptions
}

async function disposeProjectWorkspaces(
  root: string,
  workspaces: WorkspaceSession[],
): Promise<void> {
  for (const workspace of workspaces) {
    await workspace.dispose()
  }
  await FS.rm(root, { recursive: true, force: true })
}
