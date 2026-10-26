import * as Runtime from '@runtime/Runtime'
import { Errors, Try } from '@shared'
import { FileSystem, HeadlessBrowser, Platform, Repo, Tests } from '@shared/os'
import { prepareProject } from '../ProjectPreparation'
import { openProjectWorkspace } from '../ProjectWorkspace'
import * as Fixture from './ManagedMetroAcceptanceFixture'
import { createFixtureRegistry } from './ManagedMetroFixtureRegistry'

Tests.test('external npm-backed foreign view renders through the default Expo Metro pipeline in Chromium', async () => {
  const root = Fixture.acceptanceRoot()
  const workspaces: Awaited<ReturnType<typeof openProjectWorkspace>>[] = []
  let registry: Awaited<ReturnType<typeof createFixtureRegistry>> | undefined
  let browser: HeadlessBrowser.TestBrowser | undefined
  let expo: Runtime.ExpoSession | undefined
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    registry = await createFixtureRegistry(root)
    const { projects, executor } = await prepareManagedMetroFixture(root, registry.url)
    await prepareProject(projects.entry, { executor })
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

async function prepareManagedMetroFixture(root: string, registryUrl: string) {
  const projects = await Fixture.createAcceptanceProjects(root)
  const fixture = await Fixture.installFixturePackage(root, registryUrl)
  return {
    projects,
    executor: Fixture.createManagedGraphExecutor({
      runtimeModules: Repo.resolvePath('ts/7-runtime/node_modules'),
      runtimeResources: FileSystem.realpathSync(Repo.resolvePath('ts/7-runtime/_gen_runtime')),
      fixtureModules: fixture.nodeModules,
    }),
  }
}
