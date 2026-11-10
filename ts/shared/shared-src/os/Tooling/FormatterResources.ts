/** typeScriptFormatterBytes reads the pinned embedded-TSX formatter from its installed package. */
export async function typeScriptFormatterBytes(): Promise<Uint8Array> {
  const { getPath } = await import('../bridges/Bridge_dprint-typescript')
  const Native = await import('../bridges/Bridge_node/Bridge_node')
  return await Native.readFile(getPath())
}
