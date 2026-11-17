import { Errors, Json, NewlineCharacter, Schema, Time, Try } from '@shared'
import { Artifacts, Browser, FS, HttpServer, Path, Repo } from '@shared/os'
import { Addr, EventStream, Http } from '@shared/web'
import type * as Workspace from '@workspace'

import * as WebHost from '../../../../shared/shared-src/os/bridges/Bridge_browser/Bridge_browser'
import { type ReloadTiming, ReloadTimings } from '../ReloadTimings'
import { observePreviewEdit } from './ObservePreviewEdit'
import { handlePreviewEditorRequest, type PreviewEditorWorkspace } from './PreviewEditorWorkspace'
import type { PreviewFrameCount } from './PreviewMeasurement'
import type { OpenedPreview } from './PreviewOpening'
import { previewPage } from './PreviewPage'
import { PreviewPublication } from './PreviewPublication'
import { applyScenario, type PreviewScenario, previewScenarios, requirePreviewScenario } from './PreviewScenarios'
import { describeGeneratedChanges, type PreviewEditTrace } from './PreviewWork'

/** createPreviewHarness serves the local controls and revision receipt relay. */
export async function createPreviewHarness(options: HarnessOptions): Promise<PreviewHarness> {
  const sessionDir = await prepareBrowserClient(options.sessionId)
  return await startHarnessServer({
    ...options,
    scenarios: options.scenarios ?? previewScenarios,
  }, sessionDir)
}

type HarnessPreview = string | (() => Promise<string>)

/** HarnessOptions binds one browser surface to a workspace and either an eager or on-demand Expo preview. */
export type HarnessOptions = {
  workspace: Workspace.WorkspaceSession
  preview: HarnessPreview
  sessionId: string
  /** canonicalSource is the authored fixture text restored by the reset scenario. */
  canonicalSource: string
  /** scenarios is the ordered button cycle. The live Preview cycle is the default. */
  scenarios?: readonly PreviewScenario[]
  previewTimeoutMs?: number
  frameCount?: PreviewFrameCount
  editor?: PreviewEditorWorkspace
  onReload?(timing: ReloadTiming): void
}

/** PreviewHarness exposes a local URL and deterministic resource disposal. */
export type PreviewHarness = { url: string; dispose(): void }

type OptionalStreamController = EventStream.Controller | undefined
type EditState = { closed: boolean; active: boolean; pending: Set<() => void> }
type ResolvedHarnessOptions = HarnessOptions & {
  canonicalSource: string
  scenarios: readonly PreviewScenario[]
}

async function prepareBrowserClient(sessionId: string): Promise<string> {
  const directory = Artifacts.resolvePath('tmp', `preview-ui-${sessionId}`)
  await Artifacts.mkdir(directory)
  Artifacts.trackTemporary(directory)
  const build = await Browser.build([
    Repo.resolvePath('ts/repo-analysis/repo-analysis-src/Performance/preview-browser.ts'),
  ], directory)
  if (!build.success) {
    Errors.ThrowShouldNeverHappen(
      'Could not bundle the preview harness browser client: '
        + build.logs.map(log => log.message).join(NewlineCharacter),
    )
  }
  return directory
}

async function startHarnessServer(options: ResolvedHarnessOptions, sessionDir: string): Promise<PreviewHarness> {
  const streams = new Set<EventStream.Controller>()
  const encoder = new WebHost.TextEncoder()
  const edits: EditState = { closed: false, active: false, pending: new Set() }
  const frameIds = options.frameCount === 1 ? ['left'] : ['left', 'right']
  const reload = new ReloadTimings(options.sessionId, options.onReload, frameIds)
  const publication = new PreviewPublication(
    options.workspace,
    (name, data) => sendEvent(streams, encoder, name, data),
    (revision, startedAtMs) => reload.begin(revision, startedAtMs),
    event => reload.published(event),
  )
  const server = HttpServer.serve({
    idleTimeout: 0,
    hostname: Addr.Localhost,
    port: 0,
    fetch: createRequestHandler(options, sessionDir, streams, publication, encoder, reload, edits),
  })
  return {
    url: server.url.toString(),
    dispose() {
      edits.closed = true
      publication.dispose()
      for (const abort of edits.pending) {
        abort()
      }
      closeStreams(streams)
      server.stop(true)
    },
  }
}

function createRequestHandler(
  options: ResolvedHarnessOptions,
  sessionDir: string,
  streams: Set<EventStream.Controller>,
  publication: PreviewPublication,
  encoder: WebHost.TextEncoder,
  reload: ReloadTimings,
  edits: EditState,
): (request: Http.HttpRequest) => Promise<Http.HttpResponse> {
  return async request => {
    const url = Http.url(request.url)
    if (request.method === 'GET' && url.pathname === '/') {
      return pageResponse(options)
    }
    if (options.editor && (url.pathname === '/files' || url.pathname === '/file')) {
      return await handlePreviewEditorRequest(options.editor, request, url)
    }
    if (request.method === 'POST' && url.pathname === '/open-preview') {
      return await Try(() => openPreviewResponse(options, publication, url.origin), {
        catch: error => Http.response(String(error), { status: 422 }),
      })
    }
    const favicon = resolveFaviconFile(url.pathname)
    if (request.method === 'GET' && favicon) {
      return Http.response(await FS.readFile(favicon, 'utf8'), {
        headers: { 'content-type': 'image/svg+xml' },
      })
    }
    if (request.method === 'GET' && url.pathname === '/preview-browser.js') {
      return Http.response(Artifacts.file(Path.join(sessionDir, 'preview-browser.js')), {
        headers: { 'content-type': 'text/javascript; charset=utf-8' },
      })
    }
    if (request.method === 'GET' && url.pathname === '/events') {
      return eventsResponse(streams, publication, encoder)
    }
    if (request.method === 'POST' && url.pathname === '/edit') {
      return editResponse(request, options, edits)
    }
    if (request.method === 'POST' && url.pathname === '/receipt') {
      reload.receive(await request.json())
      return Http.jsonResponse({ received: true })
    }
    return Http.response('Not found', { status: 404 })
  }
}

function resolveFaviconFile(pathname: string): string | undefined {
  if (pathname === '/favicon-white.svg' || pathname === '/favicon.svg') {
    return Repo.resolvePath('Assets/Icons/tao-favicon-white.svg')
  }
  if (pathname === '/favicon-dark.svg') {
    return Repo.resolvePath('Assets/Icons/tao-favicon-dark.svg')
  }
  return undefined
}

function pageResponse(options: ResolvedHarnessOptions): Http.HttpResponse {
  const names = options.scenarios.map(scenario => scenario.name)
  return Http.response(
    previewPage({
      sessionId: options.sessionId,
      scenarios: names,
      eager: typeof options.preview === 'string',
      previewTimeoutMs: options.previewTimeoutMs,
      frameCount: options.frameCount,
      editor: options.editor !== undefined,
    }),
    {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  )
}

async function openPreviewResponse(
  options: ResolvedHarnessOptions,
  publication: PreviewPublication,
  origin: string,
): Promise<Http.HttpResponse> {
  const previewUrl = typeof options.preview === 'string' ? options.preview : await options.preview()
  const baseline = publication.readBaseline()
  if (!baseline) {
    Errors.ThrowShouldNeverHappen('Preview opened without a generated revision.')
  }
  const opened: OpenedPreview = { baseline, url: parentPreviewUrl(previewUrl, options.sessionId, origin) }
  return Http.jsonResponse(opened)
}

async function editResponse(
  request: Http.HttpRequest,
  options: ResolvedHarnessOptions,
  edits: EditState,
): Promise<Http.HttpResponse> {
  if (edits.closed) {
    return Http.response('Preview harness is closed', { status: 503 })
  }
  const scenarioName = await readScenarioName(request)
  if (scenarioName === undefined) {
    return Http.response('Invalid preview scenario request', { status: 400 })
  }
  if (options.editor) {
    const scenario = requirePreviewScenario(options.scenarios, scenarioName)
    const update = (current: string) => scenario.apply(current, options.canonicalSource)
    const saved = await options.editor.saveScenario(scenario.path, update)
    return saved
      ? Http.jsonResponse(saved)
      : Http.response('This session has manual edits. Start a new performance session to run benchmarks.', {
        status: 412,
      })
  }
  if (edits.active) {
    return Http.response('A preview edit is already pending', { status: 409 })
  }
  edits.active = true
  return await Try(() => writeEditResponse(scenarioName, options, edits), {
    finally() {
      edits.active = false
    },
  })
}

const scenarioRequestSchema = Schema.object({ scenario: Schema.string() })

async function readScenarioName(request: Http.HttpRequest): Promise<string | undefined> {
  const text = await request.text()
  return Try.WithDefault(undefined, () => Json.Parse(text, { schema: scenarioRequestSchema }).scenario)
}

async function writeEditResponse(
  scenarioName: string,
  options: ResolvedHarnessOptions,
  edits: EditState,
): Promise<Http.HttpResponse> {
  const receivedAtMs = Time.timestampMs()
  const path = options.workspace.files.entryPath ?? Errors.ThrowUserInput('Open an app before editing its source.')
  const currentSource = await FS.readFile(path, 'utf8')
  const source = applyScenario(options.scenarios, scenarioName, currentSource, options.canonicalSource)
  if (edits.closed) {
    return Http.response('Preview harness is closed', { status: 503 })
  }
  const observation = observePreviewEdit(options.workspace.files, path, source, edits.pending)
  return await Try(async () => {
    const previous = options.workspace.runtime?.generated?.files
    const writeStartedAtMs = Time.timestampMs()
    const [writtenAtMs, result] = await Promise.all([writePreviewSource(path, source), observation.result])
    const publishedFiles = options.workspace.runtime?.generated?.files
    const changes = describeGeneratedChanges(previous, publishedFiles)
    const editTrace: PreviewEditTrace = { receivedAtMs, writeStartedAtMs, writtenAtMs, changes }
    return Http.jsonResponse({ ...result, editTrace })
  }, {
    finally: observation.dispose,
  })
}

async function writePreviewSource(path: string, source: string): Promise<number> {
  await FS.writeFile(path, source, 'utf8')
  return Time.timestampMs()
}

const EventRetryMs = 1000

function eventsResponse(
  streams: Set<EventStream.Controller>,
  publication: PreviewPublication,
  encoder: WebHost.TextEncoder,
): Http.HttpResponse {
  let streamController: OptionalStreamController
  return EventStream.response({
    start(controller) {
      streamController = controller
      streams.add(controller)
      controller.enqueue(EventStream.encodeRetry(encoder, EventRetryMs))
      publication.replay((name, data) => controller.enqueue(EventStream.encodeJsonEvent(encoder, name, data)))
    },
    cancel() {
      if (streamController) {
        streams.delete(streamController)
      }
    },
  })
}

function closeStreams(streams: Set<EventStream.Controller>): void {
  for (const stream of streams) {
    stream.close()
  }
  streams.clear()
}

function sendEvent(
  streams: Set<EventStream.Controller>,
  encoder: WebHost.TextEncoder,
  name: string,
  data: object,
): void {
  const encoded = EventStream.encodeJsonEvent(encoder, name, data)
  for (const stream of streams) {
    stream.enqueue(encoded)
  }
}

function parentPreviewUrl(previewUrl: string, sessionId: string, parentOrigin: string): string {
  const url = Http.url(previewUrl)
  url.searchParams.set('sessionId', sessionId)
  url.searchParams.set('parentOrigin', parentOrigin)
  return url.toString()
}
