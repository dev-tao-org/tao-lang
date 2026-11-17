import { Errors, Json } from '@shared'
import { TypeScript } from '@tao/shared/typescript'

/** runtimeLock retains resolved workspace package versions for the standalone Expo toolchain. */
export function runtimeLock(source: string, manifest: RuntimeManifest): string {
  const parsed = TypeScript.parseConfigFileTextToJson('bun.lock', source)
  if (parsed.error) {
    Errors.ThrowShouldNeverHappen('The workspace dependency lock could not be read for runtime packaging.')
  }
  const lock = parsed.config as WorkspaceLock
  const packages = Object.fromEntries(
    Object.entries(lock.packages).filter(([, resolution]) => !resolution[0].includes('@workspace:')),
  )
  return Json.Print({
    lockfileVersion: lock.lockfileVersion,
    configVersion: lock.configVersion,
    workspaces: {
      '': {
        name: manifest.name,
        dependencies: manifest.dependencies,
        ...(manifest.devDependencies ? { devDependencies: manifest.devDependencies } : {}),
      },
    },
    packages,
    ...(lock.patchedDependencies ? { patchedDependencies: lock.patchedDependencies } : {}),
  })
}

/** RuntimeManifest pins the external dependencies consumed by one built Expo runtime. */
export type RuntimeManifest = {
  name: string
  private: true
  dependencies: RuntimeDependencyVersions
  devDependencies?: RuntimeDependencyVersions
  patchedDependencies?: RuntimePatchPaths
}

/** RuntimeDependencyVersions maps runtime package names to declared version constraints. */
export type RuntimeDependencyVersions = Record<string, string>

/** RuntimePatchPaths maps runtime dependency identities to workspace patch paths. */
export type RuntimePatchPaths = Record<string, string>

type WorkspaceLock = {
  lockfileVersion: number
  configVersion: number
  packages: Record<string, [string, ...unknown[]]>
  patchedDependencies?: Record<string, unknown>
}
