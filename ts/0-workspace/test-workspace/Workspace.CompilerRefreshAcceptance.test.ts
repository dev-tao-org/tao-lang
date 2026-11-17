import * as Runtime from '@runtime'
import { Errors, NewlineCharacter, S, Try, UserInput } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, HeadlessBrowser, Path, Platform, Repo } from '@shared/os'
import type * as Workspace from '@workspace'

import { initializeProject } from '../workspace-src/projects/Projects'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'

type ActivePreviewWorkspace = Workspace.WorkspaceSession
type OptionalPreviewWorkspace = ActivePreviewWorkspace | undefined
type OptionalExpoSession = Runtime.ExpoSession | undefined
type OptionalBrowser = HeadlessBrowser.Browser | undefined
type OptionalTimingMeasurement = number | undefined

Tests.test('compiled Tao custom-hook components refresh through Metro with committed state ownership', async () => {
  const root = Artifacts.resolvePath('tmp', `compiler-refresh-${Platform.randomUUID()}`)
  let workspace: OptionalPreviewWorkspace
  let expo: OptionalExpoSession
  let browser: OptionalBrowser
  let pageErrors: string[] = []
  await Try(async () => {
    const entry = await createProjectEntry(root)
    const session = await openProjectWorkspace(entry, {
      id: `compiler-refresh-${Platform.randomUUID()}`,
      runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules') },
    })
    workspace = session
    await expectPublished(await session.files.compileFile(entry), 'initial Tao source')
    expo = await Runtime.start(session.runtime!)
    browser = await HeadlessBrowser.launch('test compiler refresh')
    const page = await browser.newPage({ viewport: { width: 768, height: 1024 } })
    pageErrors = observePageErrors(page)
    await HeadlessBrowser.openPage(page, expo.url)
    await verifyInitialCounters(page)
    await verifyComputedEdit(page, entry, session)
    await verifyInvalidRecovery(page, entry, session)
    await verifyHookTopologyChange(page, entry, session)
    await verifyRemovedCounter(page, entry, session)
    Tests.expect(pageErrors).toEqual([])
  }, {
    async catch(error) {
      const output = await expo?.output()
      UserInput.fail(
        `Compiler-to-Metro refresh acceptance failed. ${
          output ? `${output.stdout}${NewlineCharacter}${output.stderr}` : ''
        } ${String(error)}`,
      )
    },
    async finally() {
      await browser?.close()
      await expo?.dispose()
      await workspace?.dispose()
      await FS.rm(root, { recursive: true, force: true })
    },
  })
}, 90_000)

async function createProjectEntry(root: string): Promise<string> {
  await initializeProject(root)
  const entry = Path.join(root, 'Main.tao')
  await FS.writeFile(entry, taoAppSource(2, true), 'utf8')
  return entry
}

function observePageErrors(page: HeadlessBrowser.Page): string[] {
  const errors: string[] = []
  page.setDefaultTimeout(10_000)
  page.on('pageerror', error => errors.push(error.message))
  return errors
}

function taoAppSource(factor: number, includePrimary: boolean, includeExtraHook = false): string {
  const primary = includePrimary ? '    #A Counter("A", "1")' : ''
  return S`
    use tao@ui Col

    app Main { root Root }

    view Root {
      render Col {
    ${primary}
        #B Counter("B", "10")
      }
    }

    view Counter(Id text, Initial text) {
      render inject Id, Initial ${injectionSource(factor, includeExtraHook)}
    }
  `
}

function injectionSource(factor: number, includeExtraHook: boolean): string {
  const extraHooks = includeExtraHook
    ? S`
      const topology = Tao.useWritable(() => "topology")
      const topologyValue = Tao.useValue(topology)
    `
    : ''
  const topologyView = includeExtraHook
    ? "<Tao.Text testID={'topology-' + Id}>{topologyValue}</Tao.Text>"
    : ''
  return S`
    \`\`\`ts
      const _Scope = Id
      const _Render = Initial
      const _tao\\u0056alues = Tao.useWritable(() => Number(Initial))
      const count = _tao\\u0056alues
      const current = Tao.useValue(count)
      const scaled = Tao.useComputed(() => count.jsValue() * ${factor}, [count])
      const scaledValue = Tao.useValue(scaled)
      ${extraHooks}
      return (
        <Tao.View>
          <Tao.Text testID={'count-' + Id}>{String(current)}</Tao.Text>
          <Tao.Text testID={'scaled-' + Id}>{String(scaledValue)}</Tao.Text>
          <Tao.Text testID={'identity-' + Id}>{_Scope + _Render}</Tao.Text>
          ${topologyView}
          <Tao.Pressable testID={'increment-' + Id} onPress={() => count.update(count.jsValue() + 1)}>
            <Tao.Text>increment</Tao.Text>
          </Tao.Pressable>
        </Tao.View>
      )
    \`\`\`
  `
}

async function verifyInitialCounters(page: HeadlessBrowser.Page): Promise<void> {
  await expectValue(page, 'count-A', '1')
  await expectValue(page, 'count-B', '10')
  await expectValue(page, 'scaled-A', '2')
  await expectValue(page, 'scaled-B', '20')
  await expectValue(page, 'identity-A', 'A1')
  await expectValue(page, 'identity-B', 'B10')
  await page.getByTestId('increment-A').click()
  await expectValue(page, 'count-B', '10')
  await page.getByTestId('increment-B').click()
  await expectValue(page, 'count-A', '2')
  await expectValue(page, 'count-B', '11')
}

async function verifyComputedEdit(
  page: HeadlessBrowser.Page,
  entry: string,
  workspace: Workspace.WorkspaceSession,
): Promise<void> {
  await publishSource(entry, workspace, taoAppSource(3, true))
  await expectCounters(page, 2, 11, 6, 33)
}

async function verifyInvalidRecovery(
  page: HeadlessBrowser.Page,
  entry: string,
  workspace: Workspace.WorkspaceSession,
): Promise<void> {
  const publishedPath = workspace.runtime!.appPath
  const lastGood = await FS.readFile(publishedPath, 'utf8')
  const invalid = taoAppSource(4, true).replace('app Main { root Root }', 'app Main { root }')
  await FS.writeFile(entry, invalid, 'utf8')
  Tests.expect((await workspace.files.compileFile(entry)).status).toBe('invalid')
  Tests.expect(await FS.readFile(publishedPath, 'utf8')).toBe(lastGood)
  await expectCounters(page, 2, 11, 6, 33)
  await publishSource(entry, workspace, taoAppSource(4, true))
  await expectCounters(page, 2, 11, 8, 44)
}

async function verifyRemovedCounter(
  page: HeadlessBrowser.Page,
  entry: string,
  workspace: Workspace.WorkspaceSession,
): Promise<void> {
  await page.getByTestId('increment-B').click()
  await expectValue(page, 'count-B', '11')
  await publishSource(entry, workspace, taoAppSource(4, false, true))
  await expectAbsent(page, 'count-A')
  await expectCounters(page, undefined, 11, undefined, 44)
  await page.reload()
  await expectCounters(page, undefined, 10, undefined, 40)
  await expectValue(page, 'topology-B', 'topology')
}

async function verifyHookTopologyChange(
  page: HeadlessBrowser.Page,
  entry: string,
  workspace: Workspace.WorkspaceSession,
): Promise<void> {
  await publishSource(entry, workspace, taoAppSource(4, true, true))
  await expectCounters(page, 1, 10, 4, 40)
  await expectValue(page, 'topology-A', 'topology')
  await expectValue(page, 'topology-B', 'topology')
}

async function publishSource(
  entry: string,
  workspace: Workspace.WorkspaceSession,
  source: string,
): Promise<void> {
  await FS.writeFile(entry, source, 'utf8')
  await expectPublished(await workspace.files.compileFile(entry), 'updated Tao source')
}

async function expectPublished(
  result: Workspace.UpdateResult,
  description: string,
): Promise<void> {
  if (result.status !== 'published') {
    Errors.ThrowShouldNeverHappen(`${description} was ${result.status}.`)
  }
}

async function expectCounters(
  page: HeadlessBrowser.Page,
  countA: OptionalTimingMeasurement,
  countB: number,
  scaleA: OptionalTimingMeasurement,
  scaleB: number,
): Promise<void> {
  if (countA !== undefined) {
    await expectValue(page, 'count-A', String(countA))
  }
  await expectValue(page, 'count-B', String(countB))
  if (scaleA !== undefined) {
    await expectValue(page, 'scaled-A', String(scaleA))
  }
  await expectValue(page, 'scaled-B', String(scaleB))
}

async function expectValue(page: HeadlessBrowser.Page, testID: string, expected: string): Promise<void> {
  await page.waitForFunction(
    value => document.querySelector(`[data-testid="${value.testID}"]`)?.textContent === value.expected,
    { testID, expected },
  )
}

async function expectAbsent(page: HeadlessBrowser.Page, testID: string): Promise<void> {
  await page.waitForFunction(value => !document.querySelector(`[data-testid="${value}"]`), testID)
}
