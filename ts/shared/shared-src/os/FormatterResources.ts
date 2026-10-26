/** typeScriptFormatterBytes reads the pinned embedded-TSX formatter from its installed package. */
export async function typeScriptFormatterBytes(): Promise<Uint8Array> {
  const { getPath } = await import('@dprint/typescript')
  const Native = await import('./NodeBuiltins')
  return await Native.readFile(getPath())
}
