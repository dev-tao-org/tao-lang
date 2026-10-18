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

/** response creates an HTTP response through the platform boundary. */
export function response(body: BodyInit | null = null, init?: ResponseInit): Response {
  return new Response(body, init)
}

/** jsonResponse creates a JSON response through the platform boundary. */
export function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init)
}

/** request performs an HTTP request through the platform boundary. */
export async function request(url: string, init?: RequestInit): Promise<Response> {
  return await fetch(url, init)
}

/** stream creates a byte stream through the platform boundary. */
export function stream(source: UnderlyingDefaultSource<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream(source)
}
