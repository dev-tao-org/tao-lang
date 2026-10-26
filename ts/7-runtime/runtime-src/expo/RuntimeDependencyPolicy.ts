import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'

/** RuntimeDependencyPolicy carries exact Metro package policy into separately installed app profiles. */
export type RuntimeDependencyPolicy = {
  patchedDependencies: Record<string, string>
  overrides: Record<string, string>
  patches: Record<string, string>
}

/** readRuntimeDependencyPolicy reads relocatable patch bytes and their exact package identities. */
export async function readRuntimeDependencyPolicy(directory: string): Promise<RuntimeDependencyPolicy> {
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(directory, 'package.json'), 'utf8')) as {
    patchedDependencies?: Record<string, string>
  }
  const patchedDependencies = manifest.patchedDependencies ?? {}
  const patches: Record<string, string> = {}
  const overrides: Record<string, string> = {}
  for (const [identity, path] of Object.entries(patchedDependencies)) {
    if (!path.startsWith('patches/') || path.includes('\\') || path.split('/').includes('..')) {
      Errors.ThrowUserInput(`Unsupported runtime dependency patch path: ${path}`)
    }
    const versionAt = identity.lastIndexOf('@')
    if (versionAt <= 0) {
      Errors.ThrowUserInput(`Runtime dependency patch must identify an exact package: ${identity}`)
    }
    const name = identity.slice(0, versionAt)
    if (name !== 'metro') {
      overrides[name] = identity.slice(versionAt + 1)
    }
    patches[path] = await FileSystem.readFile(Path.join(directory, path), 'utf8')
  }
  const lock = JSON.parse(await FileSystem.readFile(Path.join(directory, 'bun.lock'), 'utf8')) as {
    packages: Record<string, [string, ...unknown[]]>
  }
  const wrapper = lock.packages['@expo/metro']?.[0]
  if (wrapper) {
    overrides['@expo/metro'] = wrapper.slice('@expo/metro@'.length)
  }
  return { patchedDependencies, overrides, patches }
}
