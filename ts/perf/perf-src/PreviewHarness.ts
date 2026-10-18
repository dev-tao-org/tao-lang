import { Errors, S } from '@shared'
import { Artifacts, Path, Repo } from '@shared/os'
import type { createWorkspace } from '@workspace/Workspace'
import * as Browser from '../../shared/shared-src/os/Browser'
import * as Http from '../../shared/shared-src/os/Http'
import { type ReloadTiming, ReloadTimings } from './ReloadTimings'

/** createPreviewHarness serves the local controls and revision receipt relay. */
export async function createPreviewHarness(options: HarnessOptions): Promise<PreviewHarness> {
  const sessionDir = await prepareBrowserClient(options.sessionId)
  return await startHarnessServer(options, sessionDir)
}

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
  const reload = new ReloadTimings(options.sessionId, options.onReload)
  const stopListening = options.workspace.onExpected((revision, startedAtMs) => {
    reload.begin(revision, startedAtMs)
    expected.clear()
    expected.add(revision)
    sendEvent(streams, encoder, 'expected', { revision })
  })
  const server = Http.serve({
    idleTimeout: 0,
    hostname: '127.0.0.1',
    port: 0,
    fetch: createRequestHandler(options, sessionDir, streams, expected, encoder, reload),
  })
  return {
    url: server.url.toString(),
    dispose() {
      stopListening()
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
      return editResponse(request, options)
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

async function editResponse(request: Http.HttpRequest, options: HarnessOptions): Promise<Http.HttpResponse> {
  const body = await request.json() as { scenario?: string }
  const result = await options.workspace.update(scenarioSource(options.initialSource, body.scenario))
  return Http.jsonResponse(result)
}

/** HarnessOptions binds one browser surface to a workspace and running Expo URL. */
export type HarnessOptions = {
  workspace: Workspace
  previewUrl: string
  initialSource: string
  sessionId: string
  onReload?(timing: ReloadTiming): void
}

/** PreviewHarness exposes a local URL and deterministic resource disposal. */
export type PreviewHarness = { url: string; dispose(): void }

type Workspace = ReturnType<typeof createWorkspace>

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
  const edited = initial.replace('Hello World', 'Hello Tao')
  if (scenario === 'text') {
    return edited
  }
  const withSecondText = edited.replace('Text("Hello Tao")', 'Text("Hello Tao")\n    Text("Second view")')
  if (scenario === 'add-text') {
    return withSecondText
  }
  if (scenario === 'row') {
    return withSecondText.replace('render Col {', 'render Row {')
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
  }"><title>Tao preview performance</title><style>html,body{height:100%;margin:0;font:14px system-ui}header{height:44px;display:flex;align-items:center;gap:12px;padding:0 12px}main{height:calc(100% - 44px);display:grid;grid-template-columns:380px minmax(600px,1fr);gap:1px;background:#888}iframe{width:100%;height:100%;border:0;background:white}</style></head><body><header><button id="run">Run edit scenarios</button><span id="status">ready</span></header><main><iframe id="left" title="Narrow preview" src="${
    safe(left)
  }"></iframe><iframe id="right" title="Wide preview" src="${
    safe(right)
  }"></iframe></main><script type="module" src="/preview-browser.js"></script></body></html>
  `
}
