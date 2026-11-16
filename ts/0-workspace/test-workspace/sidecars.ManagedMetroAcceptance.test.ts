import * as Runtime from '@runtime'
import { Errors, Json, NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, HeadlessBrowser, Platform, Repo } from '@shared/os'
import { prepareProject } from '../workspace-src/ProjectPreparation'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'
import type { WorkspaceSession } from '../workspace-src/Workspace'
import * as Fixture from './sidecars.test-fixtures.ManagedMetro.Acceptance'
import { createFixtureRegistry, type FixtureRegistry } from './sidecars.test-fixtures.ManagedMetro.Registry'

type OptionalFixtureRegistry = FixtureRegistry | undefined
type OptionalTestBrowser = HeadlessBrowser.TestBrowser | undefined
type OptionalExpoSession = Runtime.ExpoSession | undefined

Tests.test('external npm-backed foreign view renders through the default Expo Metro pipeline in Chromium', async () => {
  const root = Fixture.acceptanceRoot()
  const workspaces: WorkspaceSession[] = []
  let registry: OptionalFixtureRegistry
  let browser: OptionalTestBrowser
  let expo: OptionalExpoSession
  await Try(async () => {
    await FS.mkdir(root)
    registry = await createFixtureRegistry(root)
    const { projects, executor } = await prepareManagedMetroFixture(root, registry.url)
    await prepareProject(projects.entry, { executor })
    const workspace = await openProjectWorkspace(projects.entry, {
      id: `managed-metro-${Platform.randomUUID()}`,
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
      const details = Json.Print(Errors.describe(error))
      Errors.ThrowUserInput(
        `Headless Metro acceptance failed. ${
          output ? `${output.stdout}${NewlineCharacter}${output.stderr}` : ''
        } ${details}`,
      )
    },
    async finally() {
      await browser?.dispose()
      await expo?.dispose()
      for (const workspace of workspaces) {
        await workspace.dispose()
      }
      await registry?.stop(true)
      await FS.rm(root, { recursive: true, force: true })
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
      runtimeResources: FS.realpathSync(Repo.resolvePath('ts/7-runtime/_gen_runtime')),
      fixtureModules: fixture.nodeModules,
    }),
  }
}
