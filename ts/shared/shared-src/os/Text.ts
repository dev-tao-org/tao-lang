export { format, inspect } from 'node:util'
import { Buffer } from 'node:buffer'

/** decodeBase64Ascii reads ASCII headers from an armored base64 payload. */
export function decodeBase64Ascii(value: string): string {
  return Buffer.from(value, 'base64').toString('ascii')
}
