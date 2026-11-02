import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
import { Buffer, inspectValue, stripVTControlCharacters } from './bridges/Bridge_node/Bridge_node'

export { format } from './bridges/Bridge_node/Bridge_node'

/** encodeUtf8 encodes source text for byte-indexed edits and output. */
export function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  return new WebHost.TextEncoder().encode(value)
}

/** decodeUtf8 decodes UTF-8 source and captured bytes. */
export function decodeUtf8(value: Uint8Array): string {
  return new WebHost.TextDecoder().decode(value)
}

/** stripAnsi removes terminal control sequences before rendering captured text inside a pane. */
export function stripAnsi(text: string): string {
  return stripVTControlCharacters(text)
}

/** inspect renders complete diagnostics without custom inspection, colors or truncation. */
export function inspect(value: unknown): string {
  return inspectValue(value, {
    depth: null,
    customInspect: false,
    colors: false,
    maxStringLength: null,
    maxArrayLength: null,
  })
}

/** decodeBase64Ascii reads ASCII headers from an armored base64 payload. */
export function decodeBase64Ascii(value: string): string {
  return Buffer.from(value, 'base64').toString('ascii')
}
