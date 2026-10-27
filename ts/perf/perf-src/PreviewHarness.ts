import { DefaultAppearance } from '@runtime/client/Appearance'
import { Errors, S, Try } from '@shared'
import { Artifacts, Browser, FileSystem, Http, Path, Repo } from '@shared/os'
import type { createWorkspace } from '@workspace/Workspace'
import * as WebHost from '../../shared/shared-src/os/bridges/Bridge_browser/Bridge_browser'
import { observePreviewEdit } from './ObservePreviewEdit'
import { PreviewPublication } from './PreviewPublication'
import { applyScenario, performanceScenarios, type PreviewScenario } from './PreviewScenarios'
import { type ReloadTiming, ReloadTimings } from './ReloadTimings'

/** createPreviewHarness serves the local controls and revision receipt relay. */
export async function createPreviewHarness(options: HarnessOptions): Promise<PreviewHarness> {
  const sessionDir = await prepareBrowserClient(options.sessionId)
  return await startHarnessServer({
    ...options,
    scenarios: options.scenarios ?? performanceScenarios,
  }, sessionDir)
}

/** HarnessOptions binds one browser surface to a workspace and running Expo URL. */
export type HarnessOptions = {
  workspace: Workspace
  previewUrl: string
  sessionId: string
  /** canonicalSource is the authored fixture text restored by the reset scenario. */
  canonicalSource: string
  /** scenarios is the ordered button cycle. The minimal performance cycle is the default. */
  scenarios?: readonly PreviewScenario[]
  previewTimeoutMs?: number
  frameCount?: 1 | 2
  onReload?(timing: ReloadTiming): void
}

/** PreviewHarness exposes a local URL and deterministic resource disposal. */
export type PreviewHarness = { url: string; dispose(): void }

type Workspace = ReturnType<typeof createWorkspace>
type EditState = { closed: boolean; active: boolean; pending: Set<() => void> }
type ResolvedHarnessOptions = HarnessOptions & {
  canonicalSource: string
  scenarios: readonly PreviewScenario[]
}

async function prepareBrowserClient(sessionId: string): Promise<string> {
  const directory = Artifacts.resolvePath('tmp', `preview-ui-${sessionId}`)
  await Artifacts.mkdir(directory, { recursive: true })
  Artifacts.trackTemporary(directory)
  const build = await Browser.build([Repo.resolvePath('ts/perf/perf-src/preview-browser.ts')], directory)
  if (!build.success) {
    Errors.ThrowShouldNeverHappen(
      'Could not bundle the preview harness browser client: ' + build.logs.map(log => log.message).join('\n'),
    )
  }
  return directory
}

async function startHarnessServer(options: ResolvedHarnessOptions, sessionDir: string): Promise<PreviewHarness> {
  const streams = new Set<Http.StreamController>()
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
  const server = Http.serve({
    idleTimeout: 0,
    hostname: '127.0.0.1',
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
  streams: Set<Http.StreamController>,
  publication: PreviewPublication,
  encoder: WebHost.TextEncoder,
  reload: ReloadTimings,
  edits: EditState,
): (request: Http.HttpRequest) => Promise<Http.HttpResponse> {
  return async request => {
    const url = new WebHost.URL(request.url)
    if (request.method === 'GET' && url.pathname === '/') {
      return pageResponse(options, url.origin)
    }
    const favicon = resolveFaviconFile(url.pathname)
    if (request.method === 'GET' && favicon) {
      return Http.response(await FileSystem.readFile(favicon, 'utf8'), {
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

function pageResponse(options: ResolvedHarnessOptions, origin: string): Http.HttpResponse {
  const left = frameUrl(options.previewUrl, options.sessionId, origin, 'left')
  const right = frameUrl(options.previewUrl, options.sessionId, origin, 'right')
  const names = options.scenarios.map(scenario => scenario.name)
  return Http.response(
    pageHtml(options.sessionId, options.previewUrl, left, right, names, options.previewTimeoutMs, options.frameCount),
    {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  )
}

async function editResponse(
  request: Http.HttpRequest,
  options: ResolvedHarnessOptions,
  edits: EditState,
): Promise<Http.HttpResponse> {
  if (edits.closed) {
    return Http.response('Preview harness is closed', { status: 503 })
  }
  if (edits.active) {
    return Http.response('A preview edit is already pending', { status: 409 })
  }
  edits.active = true
  return await Try(() => writeEditResponse(request, options, edits), {
    finally() {
      edits.active = false
    },
  })
}

async function writeEditResponse(
  request: Http.HttpRequest,
  options: ResolvedHarnessOptions,
  edits: EditState,
): Promise<Http.HttpResponse> {
  const body = await request.json() as { scenario?: string }
  const path = options.workspace.files.entryPath ?? Errors.ThrowUserInput('Open an app before editing its source.')
  const current = await FileSystem.readFile(path, 'utf8')
  const source = applyScenario(options.scenarios, body.scenario, current, options.canonicalSource)
  if (edits.closed) {
    return Http.response('Preview harness is closed', { status: 503 })
  }
  const observation = observePreviewEdit(options.workspace.files, path, source, edits.pending)
  return await Try(async () => {
    const [, result] = await Promise.all([FileSystem.writeFile(path, source, 'utf8'), observation.result])
    return Http.jsonResponse(result)
  }, {
    finally: observation.dispose,
  })
}

function eventsResponse(
  streams: Set<Http.StreamController>,
  publication: PreviewPublication,
  encoder: WebHost.TextEncoder,
): Http.HttpResponse {
  let streamController: Http.StreamController | undefined
  const stream = Http.stream({
    start(controller) {
      streamController = controller
      streams.add(controller)
      controller.enqueue(encoder.encode('retry: 1000\n\n'))
      publication.replay((name, data) => controller.enqueue(encodeEvent(encoder, name, data)))
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
  encoder: WebHost.TextEncoder,
  name: string,
  data: object,
): void {
  const encoded = encodeEvent(encoder, name, data)
  for (const stream of streams) {
    stream.enqueue(encoded)
  }
}

function encodeEvent(encoder: WebHost.TextEncoder, name: string, data: object): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
}

function frameUrl(previewUrl: string, sessionId: string, parentOrigin: string, frameId: string): string {
  const url = new WebHost.URL(previewUrl)
  url.searchParams.set('sessionId', sessionId)
  url.searchParams.set('frameId', frameId)
  url.searchParams.set('parentOrigin', parentOrigin)
  return url.toString()
}

function pageHtml(
  sessionId: string,
  previewUrl: string,
  left: string,
  right: string,
  scenarios: readonly string[],
  previewTimeoutMs = 10_000,
  frameCount = 2,
): string {
  const safe = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const rightFrame = frameCount === 2 ? `<iframe id="right" title="Wide preview" src="${safe(right)}"></iframe>` : ''
  const columns = frameCount === 2 ? '380px minmax(600px,1fr)' : 'minmax(380px,1fr)'
  return S`
    <!doctype html><html><head><meta charset="utf-8"><meta name="tao-preview-timeout-ms" content="${previewTimeoutMs}"><link rel="icon" href="/favicon-white.svg" media="(prefers-color-scheme: dark)"><link rel="icon" href="/favicon-dark.svg" media="(prefers-color-scheme: light)"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="tao-session" content="${
    safe(sessionId)
  }"><meta name="tao-preview-url" content="${safe(previewUrl)}"><meta name="tao-scenarios" content="${
    safe(JSON.stringify(scenarios))
  }"><title>Tao preview performance</title><style>html,body{height:100%;margin:0;font:14px system-ui;color:#e8e6e3;background:#202020;color-scheme:dark}header{height:44px;display:flex;align-items:center;gap:12px;padding:0 12px}button{font:inherit;color:inherit;background:#333;border:1px solid #555;border-radius:4px;padding:5px 10px}button:hover{background:#404040}button:disabled{color:#a8a6a3}main{height:calc(100% - 44px);display:grid;grid-template-columns:${columns};gap:1px;background:#484848}iframe{width:100%;height:100%;border:0;background:${DefaultAppearance.background};outline:1px solid ${DefaultAppearance.border};outline-offset:-1px}</style></head><body><header><button id="run">Run edit scenarios</button><span id="status">ready</span></header><main><iframe id="left" title="Narrow preview" src="${
    safe(left)
  }"></iframe>${rightFrame}</main><script type="module" src="/preview-browser.js"></script></body></html>
  `
}
