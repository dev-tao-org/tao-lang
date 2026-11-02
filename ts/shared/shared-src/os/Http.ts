import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
import * as BunHost from './bridges/Bridge_bun/Bridge_bun'
import { Buffer as NodeBuffer } from './bridges/Bridge_node/Bridge_node'
/** ServeOptions configures a local HTTP server with an explicit request handler. */
export type ServeOptions = BunHost.ServeOptions<undefined>

/** serve starts a Bun HTTP server for a local tooling surface. */
export function serve(options: ServeOptions): BunHost.Server<undefined> {
  return BunHost.getRuntime().serve(options)
}

/** StreamController exposes the enqueue and close operations for local event streams. */
export type StreamController = WebHost.ReadableStreamDefaultController<Uint8Array>

/** HttpRequest describes an incoming HTTP request at the OS boundary. */
export type HttpRequest = WebHost.Request

/** HttpResponse describes an outgoing HTTP response at the OS boundary. */
export type HttpResponse = WebHost.Response

/** Bytes describes raw HTTP response bytes at the platform boundary. */
export type Bytes = Uint8Array

/** HttpAbortController owns cancellation for platform HTTP operations. */
export type HttpAbortController = WebHost.AbortController

/** HttpAbortSignal carries cancellation across platform HTTP operations. */
export type HttpAbortSignal = AbortSignal

type ResponseBody = WebHost.BodyInit | null
/** response creates an HTTP response through the platform boundary. */
export function response(body: ResponseBody = null, init?: WebHost.ResponseInit): WebHost.Response {
  return new WebHost.Response(body, init)
}

/** url parses a URL through the platform boundary. */
export function url(value: string): WebHost.URL {
  return new WebHost.URL(value)
}

/** bytesResponse creates a response containing one byte sequence. */
export function bytesResponse(bytes: Uint8Array): WebHost.Response {
  return new WebHost.Response(NodeBuffer.from(bytes))
}

/** jsonResponse creates a JSON response through the platform boundary. */
export function jsonResponse(value: unknown, init?: WebHost.ResponseInit): WebHost.Response {
  return WebHost.Response.json(value, init)
}

/** request performs an HTTP request through the platform boundary. */
export async function request(url: string, init?: WebHost.RequestInit): Promise<WebHost.Response> {
  return await WebHost.fetch(url, init)
}

/** createAbortController creates a cancellation source for bounded platform requests. */
export function createAbortController(): HttpAbortController {
  return new WebHost.AbortController()
}

/** stream creates a byte stream through the platform boundary. */
export function stream(source: WebHost.UnderlyingDefaultSource<Uint8Array>): WebHost.ReadableStream<Uint8Array> {
  return new WebHost.ReadableStream(source)
}
