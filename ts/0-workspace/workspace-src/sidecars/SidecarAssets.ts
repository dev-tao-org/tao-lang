import * as Compile from '@compile'

/** sidecarAssetExtensions lists supported copied binary asset suffixes in discovery order. */
export const sidecarAssetExtensions = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.mp3',
  '.ttf',
  '.woff',
  '.woff2',
  '.pdf',
] as const

/** SidecarAssetDeclarations describes exactly the asset formats copied into sidecar snapshots. */
export const SidecarAssetDeclarations = Compile.compileSidecarAssetDeclarations(sidecarAssetExtensions)
