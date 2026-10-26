import { Buffer, inspectValue, stripVTControlCharacters } from './NodeBuiltins'

export { format } from './NodeBuiltins'

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
