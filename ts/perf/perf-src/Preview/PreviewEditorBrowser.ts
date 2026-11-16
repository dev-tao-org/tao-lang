import { Json, Try } from '@shared'
import * as BrowserRuntime from '@shared/os/browser'
import { Http } from '@shared/web'

import * as WebHost from '../../../shared/shared-src/os/bridges/Bridge_browser/Bridge_browser'
import { parseSavedPreviewStatus, type SavedPreviewStatus } from './PreviewBrowserJson'

type SourceEditor = {
  files: WebHost.HTMLElement
  name: WebHost.HTMLElement
  source: WebHost.HTMLTextAreaElement
  save: WebHost.HTMLButtonElement
  status: WebHost.HTMLElement
  buttons: Map<string, WebHost.HTMLButtonElement>
  drafts: Map<string, string>
  path?: string
  request: number
  saving: boolean
}

/** startPreviewEditor loads the harness file tree and binds its source editor. */
export async function startPreviewEditor(): Promise<void> {
  const shell = BrowserRuntime.querySelector<WebHost.HTMLElement>('#source-editor')
  if (!shell) {
    return
  }
  const editor: SourceEditor = {
    files: BrowserRuntime.querySelector<WebHost.HTMLElement>('#source-files')!,
    name: BrowserRuntime.querySelector<WebHost.HTMLElement>('#source-name')!,
    source: BrowserRuntime.querySelector<WebHost.HTMLTextAreaElement>('#source-text')!,
    save: BrowserRuntime.querySelector<WebHost.HTMLButtonElement>('#save-source')!,
    status: BrowserRuntime.querySelector<WebHost.HTMLElement>('#source-status')!,
    buttons: new Map(),
    drafts: new Map(),
    request: 0,
    saving: false,
  }
  editor.source.addEventListener('input', () => {
    if (editor.path) {
      editor.drafts.set(editor.path, editor.source.value)
      editor.save.disabled = false
    }
  })
  editor.save.addEventListener('click', () => void saveSource(editor))
  await Try(async () => {
    const paths = await Http.requestJson<string[]>('/files')
    for (const path of paths) {
      addFile(editor, path)
    }
    shell.dataset.filesReady = 'true'
  }, { catch: error => showError(editor, error) })
}

function addFile(editor: SourceEditor, path: string): void {
  const document = WebHost.getBrowserDocument()
  const item = document.createElement('li')
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = path
  button.addEventListener('click', () => void openFile(editor, path))
  item.append(button)
  editor.files.append(item)
  editor.buttons.set(path, button)
}

async function openFile(editor: SourceEditor, path: string): Promise<void> {
  if (editor.saving) {
    return
  }
  const request = ++editor.request
  editor.path = undefined
  editor.source.disabled = true
  editor.save.disabled = true
  editor.status.textContent = 'Loading…'
  await Try(async () => {
    const query = new WebHost.URLSearchParams({ path })
    const file = await Http.requestJson<{ source: string }>(`/file?${query}`)
    if (request !== editor.request) {
      return
    }
    const draft = editor.drafts.get(path)
    editor.path = path
    editor.name.textContent = path
    editor.source.value = draft ?? file.source
    editor.source.disabled = false
    editor.save.disabled = draft === undefined
    editor.status.textContent = draft === undefined ? '' : 'Unsaved'
    for (const [name, button] of editor.buttons) {
      button.setAttribute('aria-current', String(name === path))
    }
  }, {
    catch(error) {
      if (request === editor.request) {
        showError(editor, error)
      }
    },
  })
}

async function saveSource(editor: SourceEditor): Promise<void> {
  const path = editor.path
  if (!path || editor.saving) {
    return
  }
  editor.saving = true
  editor.source.readOnly = true
  editor.save.disabled = true
  editor.status.textContent = 'Saving…'
  await Try(async () => {
    const response = await Http.request('/file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: serializeSourceSave(path, editor.source.value),
    })
    if (!response.ok) {
      showError(editor, await response.text())
      return
    }
    const saved = parseSavedPreviewStatus(await response.text())
    editor.drafts.delete(path)
    editor.status.textContent = describeSave(saved)
  }, {
    catch: error => showError(editor, error),
    finally() {
      editor.saving = false
      editor.source.readOnly = false
      editor.save.disabled = !editor.drafts.has(path)
    },
  })
}

function serializeSourceSave(path: string, source: string): string {
  return Json.Print({ path, source })
}

function describeSave(saved: SavedPreviewStatus): string {
  if (saved.status === 'published') {
    return 'Saved'
  }
  return saved.status === 'failed' ? `Saved. ${saved.error}` : `Saved. Preview ${saved.status}.`
}

function showError(editor: SourceEditor, error: unknown): void {
  editor.status.textContent = String(error)
}
