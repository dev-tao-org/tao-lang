/** ServeOptions configures a local HTTP server with an explicit request handler. */
export type ServeOptions = Bun.ServeOptions<undefined>

/** serve starts a Bun HTTP server for a local tooling surface. */
export function serve(options: ServeOptions): Bun.Server<undefined> {
  return Bun.serve(options)
}

/** StreamController exposes the enqueue and close operations for local event streams. */
export type StreamController = ReadableStreamDefaultController<Uint8Array>

/** HttpRequest describes an incoming HTTP request at the OS boundary. */
export type HttpRequest = globalThis.Request

/** HttpResponse describes an outgoing HTTP response at the OS boundary. */
export type HttpResponse = globalThis.Response

/** Bytes describes raw HTTP response bytes at the platform boundary. */
export type Bytes = Uint8Array

type ResponseBody = BodyInit | null
/** response creates an HTTP response through the platform boundary. */
export function response(body: ResponseBody = null, init?: ResponseInit): Response {
  return new Response(body, init)
}

/** url parses a URL through the platform boundary. */
export function url(value: string): URL {
  return new URL(value)
}

/** bytesResponse creates a response containing one byte sequence. */
export function bytesResponse(bytes: Uint8Array): Response {
  return new Response(Buffer.from(bytes))
}

/** jsonResponse creates a JSON response through the platform boundary. */
export function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init)
}

/** request performs an HTTP request through the platform boundary. */
export async function request(url: string, init?: RequestInit): Promise<Response> {
  return await fetch(url, init)
}

/** createAbortController creates a cancellation source for bounded platform requests. */
export function createAbortController(): AbortController {
  return new AbortController()
}

/** stream creates a byte stream through the platform boundary. */
export function stream(source: UnderlyingDefaultSource<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream(source)
}
