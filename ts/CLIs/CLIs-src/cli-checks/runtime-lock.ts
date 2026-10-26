import { Errors } from '@shared'
import TypeScript from 'typescript'

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
  return JSON.stringify(
    {
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
    },
    null,
    2,
  )
}

/** RuntimeManifest pins the external dependencies consumed by one built Expo runtime. */
export type RuntimeManifest = {
  name: string
  private: true
  dependencies: Record<string, string>
  devDependencies?: Record<string, string>
  patchedDependencies?: Record<string, string>
}

type WorkspaceLock = {
  lockfileVersion: number
  configVersion: number
  packages: Record<string, [string, ...unknown[]]>
  patchedDependencies?: Record<string, unknown>
}
