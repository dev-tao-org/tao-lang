import * as Runtime from '@runtime/Runtime'
import { Errors, S, Timings, Try } from '@shared'
import { Artifacts, FileSystem, HeadlessBrowser, Path, Platform, Repo, Tests } from '@shared/os'
import { createProject, createWorkspace } from '@workspace/Workspace'
import { createPreviewHarness } from '../perf-src/PreviewHarness'

/** withRecoveryPreview runs the real dual-frame host against a controlled render fixture. */
export async function withRecoveryPreview(
  run: (fixture: RecoveryFixture) => Promise<void>,
): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `preview-recovery-${Platform.randomUUID()}`)
  const { workspace, source, change } = await createRecoveryWorkspace(root)
  let expo: Runtime.ExpoSession | undefined
  let browser: Awaited<ReturnType<typeof HeadlessBrowser.launch>> | undefined
  let host: Awaited<ReturnType<typeof createPreviewHarness>> | undefined
  await Try(async () => {
    Tests.expect((await workspace.update(source)).status).toBe('published')
    expo = await Runtime.start(workspace.runtime!)
    browser = await HeadlessBrowser.launch('test <file.tao>')
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    await page.clock.install()
    await page.goto(expo.url)
    await page.getByTestId('recovery-label').waitFor()
    host = await createPreviewHarness({
      workspace,
      previewUrl: expo.url,
      sessionId: Platform.randomUUID(),
      canonicalSource: source,
      previewTimeoutMs: 1000,
    })
    await page.goto(host.url)
    await run({ page, change })
  }, {
    async finally() {
      await browser?.close()
      host?.dispose()
      await workspace.dispose()
      await expo?.dispose()
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
}

/** RecoveryFixture exposes real browser and coherent source publication to the acceptance journey. */
export type RecoveryFixture = {
  page: HeadlessBrowser.Page
  change(mode: RecoveryMode): Promise<string>
}

type RecoveryMode = 'Ready' | 'Broken' | 'Repaired'

async function createRecoveryWorkspace(root: string) {
  const project = await createProject({ directory: Path.join(root, 'project') })
  const source = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  let mode: RecoveryMode = 'Ready'
  const workspace = createWorkspace({
    project,
    runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules') },
    compile: Timings.createTopLevelTimer((_timings, _document: unknown, options: { revision: string }) => ({
      'App.tsx': createRecoveryApp(options.revision, mode),
    })),
  })
  return {
    workspace,
    source,
    async change(next: RecoveryMode) {
      mode = next
      const result = await workspace.update(source.replace('Hello World', next))
      if (result.status !== 'published') {
        Errors.ThrowUserInput(`Recovery fixture publication was ${result.status}.`)
      }
      return result.revision
    },
  }
}

function createRecoveryApp(revision: string, mode: RecoveryMode): string {
  const render = mode === 'Broken'
    ? "Errors.ThrowUserInput('Deliberate preview render failure');"
    : `return React.createElement('span', { 'data-testid': 'recovery-label' }, '${mode}');`
  return S`
    import React from '@runtime/client/Bridge-React';
    import { Errors } from '@shared';
    import * as TR from '@runtime';
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
