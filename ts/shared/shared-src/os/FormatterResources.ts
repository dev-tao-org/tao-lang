import { readFile } from 'node:fs/promises'

/** typeScriptFormatterBytes reads the pinned embedded-TSX formatter from its installed package. */
export async function typeScriptFormatterBytes(): Promise<Uint8Array> {
  const { getPath } = await import('@dprint/typescript')
  return await readFile(getPath())
}
