import * as WebHost from '../../os/bridges/Bridge_browser/Bridge_browser'

/** HttpRequest describes an incoming HTTP request at the OS boundary. */
export type HttpRequest = WebHost.Request

/** HttpResponse describes an outgoing HTTP response at the OS boundary. */
export type HttpResponse = WebHost.Response

/** Bytes describes raw HTTP response bytes at the platform boundary. */
export type Bytes = Uint8Array

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
  return new WebHost.Response(new Uint8Array(bytes))
}

/** jsonResponse creates a JSON response through the platform boundary. */
export function jsonResponse(value: unknown, init?: WebHost.ResponseInit): WebHost.Response {
  return WebHost.Response.json(value, init)
}

/** request performs an HTTP request through the platform boundary. */
export async function request(url: string, init?: WebHost.RequestInit): Promise<WebHost.Response> {
  return await WebHost.fetch(url, init)
}

/** requestJson sends a request and decodes its JSON response. */
export async function requestJson<Value>(url: string, init?: WebHost.RequestInit): Promise<Value> {
  const received = await request(url, init)
  return await received.json() as Value
}
