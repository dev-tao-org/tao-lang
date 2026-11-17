import * as Runtime from '@runtime'
import { S, Timings, Try, UserInput } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, HeadlessBrowser, Path, Platform, Repo } from '@shared/os'
import * as Workspace from '@workspace'

import { createPreviewHarness, type PreviewHarness } from '../../repo-analysis-src/Performance/Preview/PreviewHarness'

/** withRecoveryPreview runs the real dual-frame host against a controlled render fixture. */
export async function withRecoveryPreview(run: (fixture: RecoveryFixture) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `preview-recovery-${Platform.randomUUID()}`)
  const { workspace, source, change } = await createRecoveryWorkspace(root)
  let expo: OptionalExpoSession
  let browser: OptionalRecoveryBrowser
  let host: OptionalRecoveryHost
  await Try(async () => {
    Tests.expect((await workspace.update(source)).status).toBe('published')
    expo = await Runtime.start(workspace.runtime!)
    browser = await HeadlessBrowser.launch('test <file.tao>')
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    await page.clock.install()
    await observePreviewPublications(page)
    await page.goto(expo.url)
    await page.getByTestId('recovery-label').waitFor()
    host = await createPreviewHarness({
      workspace,
      preview: async () => expo!.url,
      sessionId: Platform.randomUUID(),
      canonicalSource: source,
      previewTimeoutMs: 1000,
    })
    await page.goto(host.url)
    await page.getByRole('button', { name: 'Show previews' }).click()
    await run({ page, change })
  }, {
    async finally() {
      await browser?.close()
      host?.dispose()
      await workspace.dispose()
      await expo?.dispose()
      await FS.rm(root, { recursive: true, force: true })
    },
  })
}

/** RecoveryFixture exposes real browser and coherent source publication to the acceptance journey. */
export type RecoveryFixture = {
  page: HeadlessBrowser.Page
  change(mode: RecoveryMode): Promise<string>
}

type RecoveryMode = 'Ready' | 'Broken' | 'Repaired' | 'Invalid'
type OptionalExpoSession = Runtime.ExpoSession | undefined
type OptionalRecoveryBrowser = HeadlessBrowser.HeadlessBrowserSession | undefined
type OptionalRecoveryHost = PreviewHarness | undefined

async function createRecoveryWorkspace(root: string) {
  const project = await Workspace.createProject({ directory: Path.join(root, 'project') })
  const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
  let mode: RecoveryMode = 'Ready'
  const workspace = Workspace.createWorkspace({
    project,
    runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules') },
    compile: Timings.createTopLevelTimer((_timings, _document: unknown, options: { revision: string }) => {
      UserInput.Require(mode !== 'Invalid', 'Deliberate preview build failure')
      return { 'App.tsx': createRecoveryApp(options.revision, mode) }
    }),
  })
  return {
    workspace,
    source,
    async change(next: RecoveryMode) {
      mode = next
      const result = await workspace.update(source.replace('Hello World', next))
      if (result.status !== 'published') {
        UserInput.Fail(`Recovery fixture publication was ${result.status}.`)
      }
      return result.revision
    },
  }
}

async function observePreviewPublications(page: HeadlessBrowser.Page): Promise<void> {
  await page.addInitScript(() => {
    const add = EventSource.prototype.addEventListener
    Object.defineProperty(EventSource.prototype, 'addEventListener', {
      value(this: EventSource, ...args: Parameters<typeof add>) {
        add.apply(this, args)
        if (args[0] !== 'outcome' && args[0] !== 'baseline') {
          return
        }
        if (args[0] === 'baseline') {
          document.addEventListener('fixture:replay-baseline', event => {
            const data = (event as CustomEvent<string>).detail
            this.dispatchEvent(new MessageEvent('baseline', { data }))
          })
        }
        const attribute = `data-received-${args[0]}`
        add.call(this, args[0], (event: Event) => {
          document.body.setAttribute(attribute, (event as MessageEvent<string>).data)
        })
      },
    })
  })
}

function createRecoveryApp(revision: string, mode: RecoveryMode): string {
  const render = mode === 'Broken'
    ? "UserInput.Fail('Deliberate preview render failure');"
    : `return React.createElement('span', { 'data-testid': 'recovery-label' }, '${mode}');`
  return S`
    import React from '@runtime/client/Bridge_react/Bridge_react';
    import { UserInput } from '@shared';
    import * as TR from '@tao/runtime/generated';
    TR.ModuleApplied('${revision}');
    function RecoveryStage() {
      ${render}
    }
    const stage = TR.ViewDeclaration('RecoveryStage', [], RecoveryStage);
    export default function App() {
      return TR.AppDeclaration(stage, '${revision}');
    }
  `
}
