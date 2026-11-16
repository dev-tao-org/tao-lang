import * as WebHost from '../../os/bridges/Bridge_browser/Bridge_browser'
import * as Json from '../../universal/Json'
import { joinTextLines } from '../../universal/S'
import * as Http from './Http'

/** Controller sends bytes to an active server-sent event stream. */
export type Controller = WebHost.ReadableStreamDefaultController<Uint8Array>

/** open subscribes to server-sent events on the active web host. */
export function open(url: string): WebHost.EventSource {
  return new WebHost.EventSource(url)
}

/** response serves an event stream without caching. */
export function response(source: WebHost.UnderlyingDefaultSource<Uint8Array>): Http.HttpResponse {
  return Http.response(new WebHost.ReadableStream(source), {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    },
  })
}

/** encodeRetry sets the reconnect delay for an event stream. */
export function encodeRetry(encoder: WebHost.TextEncoder, delayMs: number): Uint8Array {
  return encoder.encode(joinTextLines(`retry: ${delayMs}`, '', ''))
}

/** encodeJsonEvent frames one named event with a compact JSON payload. */
export function encodeJsonEvent(encoder: WebHost.TextEncoder, name: string, data: object): Uint8Array {
  const json = Json.Print(data, { prettyPrint: false })
  return encoder.encode(joinTextLines(`event: ${name}`, `data: ${json}`, '', ''))
}
