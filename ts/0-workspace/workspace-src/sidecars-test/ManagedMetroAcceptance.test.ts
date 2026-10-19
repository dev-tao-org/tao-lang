import * as Runtime from '@runtime/Runtime'
import { Errors, Try } from '@shared'
import { FileSystem, HeadlessBrowser, Platform, Repo, Tests } from '@shared/os'
import { prepareProject } from '../ProjectPreparation'
import { openProjectWorkspace } from '../ProjectWorkspace'
import {
  acceptanceRoot,
  createAcceptanceProjects,
  installFixturePackage,
  managedGraphExecutor,
} from './ManagedMetroAcceptanceFixture'
import { createFixtureRegistry } from './ManagedMetroFixtureRegistry'

Tests.test('external npm-backed foreign view renders through the default Expo Metro pipeline in Chromium', async () => {
  const root = acceptanceRoot()
  const workspaces: Awaited<ReturnType<typeof openProjectWorkspace>>[] = []
  let registry: Awaited<ReturnType<typeof createFixtureRegistry>> | undefined
  let browser: HeadlessBrowser.TestBrowser | undefined
  let expo: Runtime.ExpoSession | undefined
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    const projects = await createAcceptanceProjects(root)
    registry = await createFixtureRegistry(root)
    const fixture = await installFixturePackage(root, registry.url)
    const runtimePins = await Runtime.runtimeDependencies()
    const runtimeResources = FileSystem.realpathSync(Repo.resolvePath('ts/7-runtime/_gen_runtime'))
    const runtimeModules = Repo.resolvePath('ts/7-runtime/node_modules')
    const executor = managedGraphExecutor({ runtimeModules, runtimeResources, fixtureModules: fixture.nodeModules })
    await prepareProject(projects.entry, { executor, runtimePins })
    const workspace = await openProjectWorkspace(projects.entry, {
      id: `managed-metro-${Platform.randomUUID()}`,
      acquireLease: async () => () => {},
    })
    workspaces.push(workspace)
    const result = await workspace.files.openFile(projects.entry)
    Tests.expect(result.status).toBe('published')
    Tests.expect(workspace.runtime).not.toBeUndefined()
    expo = await Runtime.start(workspace.runtime!)
    browser = await HeadlessBrowser.openTestBrowser()
    await browser.open(expo.url)
    await browser.expectText('label:metro-rendered')
  }, {
    async catch(error) {
      const output = await expo?.output()
      Errors.ThrowUserInput(
        `Headless Metro acceptance failed. ${output ? `${output.stdout}\n${output.stderr}` : ''} ${String(error)}`,
      )
    },
    async finally() {
      await browser?.dispose()
      await expo?.dispose()
      for (const workspace of workspaces) {
        await workspace.dispose()
      }
      await registry?.stop(true)
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
}, 60_000)
