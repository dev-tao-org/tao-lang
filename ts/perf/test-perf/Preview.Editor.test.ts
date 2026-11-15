import { Errors, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, HeadlessBrowser, Path, Platform } from '@shared/os'
import * as Workspace from '@workspace'

import { preparePreviewEditor } from '../perf-src/Preview/PreviewEditorWorkspace'
import { createPreviewHarness } from '../perf-src/Preview/PreviewHarness'

const EntrySource = S`
  use tao@ui Col, Text
  use package ./Support

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

  public view Support {
    render Text("Original module")
  }
`

Tests.test('the performance editor opens a dependency and saves it through the project compiler', async () => {
  const directory = Artifacts.resolvePath('tmp', `performance-editor-${Platform.randomUUID()}`)
  await Try(() => verifyEditor(directory), { finally: () => FS.rm(directory, { recursive: true, force: true }) })
}, 30_000)

async function verifyEditor(directory: string): Promise<void> {
  const project = await Workspace.createProject({ directory })
  const workspace = Workspace.createWorkspace({ directory: project.directory })
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
