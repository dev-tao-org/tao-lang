import { Errors, S, Time, Try } from '@shared'
import { Artifacts, Browser, FileSystem, Http, Path, Repo } from '@shared/os'
import type { createWorkspace, UpdateResult } from '@workspace/Workspace'
import { type ReloadTiming, ReloadTimings } from './ReloadTimings'

/** createPreviewHarness serves the local controls and revision receipt relay. */
export async function createPreviewHarness(options: HarnessOptions): Promise<PreviewHarness> {
  const sessionDir = await prepareBrowserClient(options.sessionId)
  return await startHarnessServer(options, sessionDir)
}

/** HarnessOptions binds one browser surface to a workspace and running Expo URL. */
export type HarnessOptions = {
  workspace: Workspace
  previewUrl: string
  sessionId: string
  onReload?(timing: ReloadTiming): void
}

/** PreviewHarness exposes a local URL and deterministic resource disposal. */
export type PreviewHarness = { url: string; dispose(): void }

type Workspace = ReturnType<typeof createWorkspace>
type EditState = { closed: boolean; pending: Set<() => void> }

async function prepareBrowserClient(sessionId: string): Promise<string> {
  const directory = Artifacts.resolvePath('tmp', `preview-ui-${sessionId}`)
  await Artifacts.mkdir(directory, { recursive: true })
  Artifacts.trackTemporary(directory)
  const build = await Browser.build([Repo.resolvePath('ts/perf/perf-src/preview-browser.ts')], directory)
  if (!build.success) {
    Errors.ThrowUnexpected(
      'Could not bundle the preview harness browser client: ' + build.logs.map(log => log.message).join('\n'),
    )
  }
  return directory
}

async function startHarnessServer(options: HarnessOptions, sessionDir: string): Promise<PreviewHarness> {
  const streams = new Set<Http.StreamController>()
  const expected = new Set<string>()
  const encoder = new TextEncoder()
  const edits: EditState = { closed: false, pending: new Set() }
  const reload = new ReloadTimings(options.sessionId, options.onReload)
  const stopListening = options.workspace.onExpected((revision, startedAtMs) => {
    reload.begin(revision, startedAtMs)
    expected.clear()
    expected.add(revision)
    sendEvent(streams, encoder, 'expected', { revision })
  })
  const stopPublished = options.workspace.onPublished(publication => reload.published(publication))
  const server = Http.serve({
    idleTimeout: 0,
    hostname: '127.0.0.1',
    port: 0,
    fetch: createRequestHandler(options, sessionDir, streams, expected, encoder, reload, edits),
  })
  return {
    url: server.url.toString(),
    dispose() {
      edits.closed = true
      stopListening()
      stopPublished()
      for (const abort of edits.pending) {
        abort()
      }
      closeStreams(streams)
      server.stop(true)
    },
  }
}

function createRequestHandler(
  options: HarnessOptions,
  sessionDir: string,
  streams: Set<Http.StreamController>,
  expected: Set<string>,
  encoder: TextEncoder,
  reload: ReloadTimings,
  edits: EditState,
): (request: Http.HttpRequest) => Promise<Http.HttpResponse> {
  return async request => {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/') {
      return pageResponse(options, url.origin)
    }
    if (request.method === 'GET' && url.pathname === '/preview-browser.js') {
      return Http.response(Artifacts.file(Path.join(sessionDir, 'preview-browser.js')), {
        headers: { 'content-type': 'text/javascript; charset=utf-8' },
      })
    }
    if (request.method === 'GET' && url.pathname === '/events') {
      return eventsResponse(streams, expected, encoder)
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

function pageResponse(options: HarnessOptions, origin: string): Http.HttpResponse {
  const left = frameUrl(options.previewUrl, options.sessionId, origin, 'left')
  const right = frameUrl(options.previewUrl, options.sessionId, origin, 'right')
  return Http.response(pageHtml(options.sessionId, options.previewUrl, left, right), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

async function editResponse(
  request: Http.HttpRequest,
  options: HarnessOptions,
  edits: EditState,
): Promise<Http.HttpResponse> {
  const body = await request.json() as { scenario?: string }
  const path = options.workspace.files.entryPath ?? Errors.ThrowUserInput('Open an app before editing its source.')
  const source = scenarioSource(await FileSystem.readFile(path, 'utf8'), body.scenario)
  if (edits.closed) {
    return Http.response('Preview harness is closed', { status: 503 })
  }
  const observation = observeEdit(options.workspace, path, source, edits.pending)
  return await Try(async () => {
    const [, result] = await Promise.all([FileSystem.writeFile(path, source, 'utf8'), observation.result])
    return Http.jsonResponse(result)
  }, {
    finally: observation.dispose,
  })
}

function observeEdit(workspace: Workspace, path: string, source: string, pendingEdits: Set<() => void>) {
  let resolve!: (result: UpdateResult) => void
  let reject!: (error: unknown) => void
  const result = new Promise<UpdateResult>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  const stop = workspace.files.onCompiled(event => {
    if (event.path === path && event.source === source) {
      resolve(event.result)
    }
  })
  const cancel = Time.schedule(5000, () => reject(editFailure('Saved source was not observed: ' + path)))
  pendingEdits.add(abort)
  return { result, dispose }

  function dispose(): void {
    stop()
    cancel()
    pendingEdits.delete(abort)
  }

  function abort(): void {
    reject(editFailure('Preview harness closed before source compilation finished.'))
    dispose()
  }
}

function editFailure(message: string): Errors.TaoError {
  return Try(() => Errors.ThrowHostEnvironment(message), { catch: error => Errors.fromUnknown(error) })
}

function eventsResponse(
  streams: Set<Http.StreamController>,
  expected: Set<string>,
  encoder: TextEncoder,
): Http.HttpResponse {
  let streamController: Http.StreamController | undefined
  const stream = Http.stream({
    start(controller) {
      streamController = controller
      streams.add(controller)
      controller.enqueue(encoder.encode('retry: 1000\n\n'))
      for (const revision of expected) {
        controller.enqueue(encodeEvent(encoder, 'expected', { revision }))
      }
    },
    cancel() {
      if (streamController) {
        streams.delete(streamController)
      }
    },
  })
  return Http.response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  })
}

function closeStreams(streams: Set<Http.StreamController>): void {
  for (const stream of streams) {
    stream.close()
  }
  streams.clear()
}

function sendEvent(
  streams: Set<Http.StreamController>,
  encoder: TextEncoder,
  name: string,
  data: object,
): void {
  const encoded = encodeEvent(encoder, name, data)
  for (const stream of streams) {
    stream.enqueue(encoded)
  }
}

function encodeEvent(encoder: TextEncoder, name: string, data: object): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
}

function scenarioSource(initial: string, scenario: string | undefined): string {
  if (scenario === 'text') {
    return initial.replace('Hello World', 'Hello Tao')
  }
  if (scenario === 'add-text') {
    return initial.replace('Text("Hello Tao")', 'Text("Hello Tao")\n    Text("Second view")')
  }
  if (scenario === 'row') {
    return initial.replace('render Col {', 'render Row {')
  }
  return Errors.ThrowUserInput('Unknown preview performance scenario: ' + String(scenario))
}

function frameUrl(previewUrl: string, sessionId: string, parentOrigin: string, frameId: string): string {
  const url = new URL(previewUrl)
  url.searchParams.set('sessionId', sessionId)
  url.searchParams.set('frameId', frameId)
  url.searchParams.set('parentOrigin', parentOrigin)
  return url.toString()
}

function pageHtml(sessionId: string, previewUrl: string, left: string, right: string): string {
  const safe = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return S`
    <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="tao-session" content="${
    safe(sessionId)
  }"><meta name="tao-preview-url" content="${
    safe(previewUrl)
  }"><title>Tao preview performance</title><style>html,body{height:100%;margin:0;font:14px system-ui;color:#e8e6e3;background:#202020;color-scheme:dark}header{height:44px;display:flex;align-items:center;gap:12px;padding:0 12px}button{font:inherit;color:inherit;background:#333;border:1px solid #555;border-radius:4px;padding:5px 10px}button:hover{background:#404040}button:disabled{color:#a8a6a3}main{height:calc(100% - 44px);display:grid;grid-template-columns:380px minmax(600px,1fr);gap:1px;background:#484848}iframe{width:100%;height:100%;border:0;background:#252525}</style></head><body><header><button id="run">Run edit scenarios</button><span id="status">ready</span></header><main><iframe id="left" title="Narrow preview" src="${
    safe(left)
  }"></iframe><iframe id="right" title="Wide preview" src="${
    safe(right)
  }"></iframe></main><script type="module" src="/preview-browser.js"></script></body></html>
  `
}
