import { Errors, Json, Schema, Time, Try, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { Http } from '@shared/web'
import type * as Workspace from '@workspace'

import type * as WebHost from '../../../../shared/shared-src/os/bridges/Bridge_browser/Bridge_browser'
import type { MeasurementSource } from './PreviewMeasurement'
import { describeGeneratedChanges, type PreviewEditTrace } from './PreviewWork'

const EntryFile = 'Performance.tao'

/** preparePreviewEditor writes the fixed fixture into an isolated project before the browser opens. */
export async function preparePreviewEditor(
  workspace: Workspace.WorkspaceSession,
  directory: string,
  fixture: MeasurementSource,
): Promise<PreviewEditorWorkspace> {
  const sourceDirectory = Path.join(directory, '_source')
  const modules = fixture.extraFiles.map(({ name, source }) => ({ path: name + '.tao', source }))
  const files = [{ path: EntryFile, source: fixture.entry }, ...modules]
  await FS.mkdir(sourceDirectory)
  await Promise.all(files.map(file => FS.writeFile(Path.join(sourceDirectory, file.path), file.source, 'utf8')))
  return new PreviewEditorWorkspace(workspace, sourceDirectory, files.map(file => file.path))
}

/** SavedPreviewEdit reports the persisted edit and the corresponding compiler outcome. */
export type SavedPreviewEdit = Workspace.UpdateResult & { editTrace: PreviewEditTrace }

type PreviewSourceTransform = (source: string) => string
type PreviewEditMode = 'manual' | 'scenario'
type OptionalScenarioPath = string | undefined

/** PreviewEditorWorkspace serializes complete saves in the existing project compiler session. */
export class PreviewEditorWorkspace {
  private tail = Promise.resolve()
  private closed = false
  private editMode?: PreviewEditMode

  constructor(
    private readonly workspace: Workspace.WorkspaceSession,
    private readonly directory: string,
    readonly files: readonly string[],
  ) {}

  read(path: string): Promise<string> {
    const file = this.resolveFile(path)
    return this.enqueue(() => FS.readFile(file, 'utf8'))
  }

  compileInitial(): Promise<void> {
    return this.enqueue(async () => {
      if (this.workspace.lastGoodRevision === undefined) {
        const result = await this.compileEntry()
        if (result.status !== 'published') {
          Errors.ThrowShouldNeverHappen(`The performance project could not start (${result.status}).`)
        }
      }
    })
  }

  save(
    path: string,
    mode: PreviewEditMode,
    updateSource: PreviewSourceTransform,
  ): Promise<SavedPreviewEdit | undefined> {
    const file = this.resolveFile(path)
    const receivedAtMs = Time.timestampMs()
    return this.enqueue(async () => {
      if (this.editMode && this.editMode !== mode) {
        return undefined
      }
      const source = updateSource(await FS.readFile(file, 'utf8'))
      this.editMode = mode
      const previous = this.workspace.runtime?.generated?.files
      const writeStartedAtMs = Time.timestampMs()
      await FS.writeFile(file, source, 'utf8')
      const writtenAtMs = Time.timestampMs()
      const result = await this.compileEntry(receivedAtMs)
      const changes = describeGeneratedChanges(previous, this.workspace.runtime?.generated?.files)
      const editTrace: PreviewEditTrace = { receivedAtMs, writeStartedAtMs, writtenAtMs, changes }
      return { ...result, editTrace }
    })
  }

  saveScenario(
    path: OptionalScenarioPath,
    updateSource: PreviewSourceTransform,
  ): Promise<SavedPreviewEdit | undefined> {
    return this.save(path ?? EntryFile, 'scenario', updateSource)
  }

  async close(): Promise<void> {
    this.closed = true
    await this.tail
  }

  private compileEntry(startedAtMs?: number): Promise<Workspace.UpdateResult> {
    return this.workspace.files.compileFile(this.resolveFile(EntryFile), startedAtMs)
  }

  private resolveFile(path: string): string {
    if (!this.files.includes(path)) {
      UserInput.Fail(`Unknown performance source file: ${path}`)
    }
    return Path.join(this.directory, path)
  }

  private enqueue<Result>(run: () => Promise<Result>): Promise<Result> {
    UserInput.Require(!this.closed, 'The performance editor is closed.')
    const pending = this.tail.then(run)
    this.tail = pending.then(() => undefined, () => undefined)
    return pending
  }
}

/** handlePreviewEditorRequest serves the static source tree and accepts same-origin saves. */
export async function handlePreviewEditorRequest(
  editor: PreviewEditorWorkspace,
  request: Http.HttpRequest,
  url: WebHost.URL,
): Promise<Http.HttpResponse> {
  if (url.pathname === '/files') {
    return request.method === 'GET'
      ? Http.jsonResponse(editor.files)
      : Http.response('Method not allowed', { status: 405 })
  }
  if (request.method === 'GET') {
    return await readEditorFile(editor, url.searchParams.get('path'))
  }
  if (request.method === 'POST') {
    return await saveEditorFile(editor, request, url.origin)
  }
  return Http.response('Method not allowed', { status: 405 })
}

type EditorPathQuery = string | null

async function readEditorFile(editor: PreviewEditorWorkspace, path: EditorPathQuery): Promise<Http.HttpResponse> {
  if (path === null || !editor.files.includes(path)) {
    return Http.response('Source file not found', { status: 404 })
  }
  return Http.jsonResponse({ source: await editor.read(path) })
}

const saveRequestSchema = Schema.object({ path: Schema.string(), source: Schema.string() })

async function saveEditorFile(
  editor: PreviewEditorWorkspace,
  request: Http.HttpRequest,
  origin: string,
): Promise<Http.HttpResponse> {
  if (request.headers.get('origin') !== origin) {
    return Http.response('Save requires the editor origin', { status: 403 })
  }
  const text = await request.text()
  const save = Try.WithDefault(undefined, () => Json.Parse(text, { schema: saveRequestSchema }))
  if (!save || !editor.files.includes(save.path)) {
    return Http.response('Invalid source file save', { status: 400 })
  }
  const saved = await editor.save(save.path, 'manual', () => save.source)
  return saved
    ? Http.jsonResponse(saved)
    : Http.response('This session is running benchmark edits. Start a new performance session to save source.', {
      status: 409,
    })
}
