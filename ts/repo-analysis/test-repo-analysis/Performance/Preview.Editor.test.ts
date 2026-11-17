import { Errors, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, HeadlessBrowser, Path, Platform, Repo } from '@shared/os'
import * as Workspace from '@workspace'

import { openPerformanceHarness } from '../../repo-analysis-src/Performance/Preview/PerformanceHarness'
import { preparePreviewEditor } from '../../repo-analysis-src/Performance/Preview/PreviewEditorWorkspace'
import { createPreviewHarness } from '../../repo-analysis-src/Performance/Preview/PreviewHarness'

const EntrySource = S`
  use tao@ui Col, Text
  use Support

  app Performance {
    root Preview
  }

  view Preview {
    render Col {
      Text("Entry source")
    }
  }
`

const ModuleSource = S`
  use tao@ui Text

  package view Support {
    render Text("Original module")
  }
`

Tests.test('the performance editor opens a dependency and saves it through the project compiler', async () => {
  const directory = Artifacts.resolvePath('tmp', `performance-editor-${Platform.randomUUID()}`)
  await Try(() => verifyEditor(directory), { finally: () => FS.rm(directory, { recursive: true, force: true }) })
}, 30_000)

Tests.test('the editor can reopen a repaired preview without overwriting its saved source', async () => {
  const directory = Artifacts.resolvePath('tmp', `performance-editor-${Platform.randomUUID()}`)
  await Try(() => verifyRepairedPreview(directory), {
    finally: () => FS.rm(directory, { recursive: true, force: true }),
  })
}, 30_000)

async function verifyRepairedPreview(directory: string): Promise<void> {
  const project = await Workspace.createProject({ directory })
  const workspace = Workspace.createWorkspace({
    project,
    runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules') },
  })
  const initialSource = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
  const harness = await openPerformanceHarness({ project, workspace, initialSource })
  await Try(async () => {
    const browser = await HeadlessBrowser.launch('test <file.tao>')
    await Try(async () => {
      const page = await browser.newPage()
      await page.goto(harness.url)
      await page.getByRole('button', { name: 'Performance.tao' }).click()
      await savePerformanceEntry(page, 'view Preview {')
      await page.getByText('Saved. Preview invalid.', { exact: true }).waitFor()
      const show = page.getByRole('button', { name: 'Show previews' })
      await show.click()
      await page.locator('body[data-status="open-failed"]').waitFor()
      const repaired = initialSource.replace('Hello World', 'Repaired source')
      await savePerformanceEntry(page, repaired)
      await page.getByText('Saved', { exact: true }).waitFor()
      await show.click()
      await page.frameLocator('#left').getByText('Repaired source', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Run edit scenarios' }).click()
      await page.getByText('This session has manual edits.', { exact: false }).waitFor()
      const saved = await FS.readFile(Path.join(directory, '_source/Performance.tao'), 'utf8')
      Tests.expect(saved).toContain('Text("Repaired source")')
    }, { finally: () => browser.close() })
  }, { finally: () => harness.dispose() })
}

async function savePerformanceEntry(page: HeadlessBrowser.Page, source: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Performance.tao' }).fill(source)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
}

async function verifyEditor(directory: string): Promise<void> {
  const project = await Workspace.createProject({ directory })
  const workspace = Workspace.createWorkspace({
    directory: project.directory,
    runtimeOptions: { dependencyDirectory: Repo.resolvePath('ts/7-runtime/node_modules') },
  })
  await Try(async () => {
    const editor = await preparePreviewEditor(workspace, project.directory, {
      entry: EntrySource,
      extraFiles: [{ name: 'Support', source: ModuleSource }],
    })
    const harness = await createPreviewHarness({
      workspace,
      editor,
      sessionId: Platform.randomUUID(),
      canonicalSource: EntrySource,
      preview: async () => Errors.ThrowShouldNeverHappen('The editor test keeps previews closed.'),
    })
    await Try(async () => {
      const browser = await HeadlessBrowser.launch('test <file.tao>')
      await Try(async () => {
        const page = await browser.newPage()
        await page.goto(harness.url)
        await verifyEditorSave(page, directory)
        Tests.expect(workspace.lastGoodRevision).toBe('r1')
      }, { finally: () => browser.close() })
    }, {
      async finally() {
        harness.dispose()
        await editor.close()
      },
    })
  }, { finally: () => workspace.dispose() })
}

async function verifyEditorSave(page: HeadlessBrowser.Page, directory: string): Promise<void> {
  const files = page.getByRole('navigation', { name: 'Project files' })
  await files.getByRole('button', { name: 'Performance.tao' }).waitFor()
  await files.getByRole('button', { name: 'Support.tao' }).click()
  const text = page.getByRole('textbox', { name: 'Support.tao' })
  await text.waitFor()
  Tests.expect(await text.inputValue()).toBe(ModuleSource)
  const edited = ModuleSource.replace('Original module', 'Edited module')
  await text.fill(edited)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Saved', { exact: true }).waitFor()
  Tests.expect(await FS.readFile(Path.join(directory, '_source/Support.tao'), 'utf8')).toBe(edited)
  Tests.expect(await page.locator('iframe[src]').count()).toBe(0)
}
