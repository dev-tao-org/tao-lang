import { Json, NullCharacter } from '@shared'
import { Platform } from '@shared/os'
import type { RuntimePatches } from './RuntimePatches'

/** ToolchainIdentity records resource bytes and the platform that will execute the installed dependencies. */
export type ToolchainIdentity = {
  manifest: string
  lockfile: string
  patches: RuntimePatches['patches']
  runtimeVersion: string
  os: string
  architecture: string
}

const ToolchainCachePolicy = 'bun-frozen-ignore-scripts-v1'

/** calculateToolchainKey hashes the exact resource and platform identity under the current installation policy. */
export function calculateToolchainKey(identity: ToolchainIdentity): string {
  const { manifest, lockfile, patches, runtimeVersion, os, architecture } = identity
  const patchIdentity = serializeRuntimePatchIdentity(patches)
  const contents = [manifest, lockfile, patchIdentity, runtimeVersion, os, architecture, ToolchainCachePolicy]
    .join(NullCharacter)
  return Platform.hashText(contents)
}

function serializeRuntimePatchIdentity(patches: RuntimePatches['patches']): string {
  return Json.Print(patches)
}
