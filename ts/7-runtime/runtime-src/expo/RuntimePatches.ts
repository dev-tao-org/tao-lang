import { Json, UserInput } from '@shared'
import { FS, Path } from '@shared/os'

/** RuntimePatches carries exact patch identities and their relocatable source files. */
export type RuntimePatches = { patchedDependencies: PatchedDependencyPaths; patches: RuntimePatchContents }

type PatchedDependencyPaths = Record<string, string>

type RuntimePatchContents = Record<string, string>

/** readRuntimePatches validates dependency patch paths and reads their relocatable source bytes. */
export async function readRuntimePatches(directory: string): Promise<RuntimePatches> {
  const manifest = await readRuntimePackageManifest(Path.join(directory, 'package.json'))
  const patchedDependencies = manifest.patchedDependencies ?? {}
  const patches: RuntimePatchContents = {}
  const entries = Object.entries(patchedDependencies).sort((left, right) => left[1].localeCompare(right[1]))
  for (const [, path] of entries) {
    if (!isSupportedPatchPath(path)) {
      UserInput.fail(`Unsupported runtime dependency patch path: ${path}`)
    }
    patches[path] = await FS.readFile(Path.join(directory, path), 'utf8')
  }
  return { patchedDependencies, patches }
}

type RuntimePackageManifest = { patchedDependencies?: PatchedDependencyPaths }

async function readRuntimePackageManifest(path: string): Promise<RuntimePackageManifest> {
  const parsed: unknown = Json.Parse(await FS.readFile(path, 'utf8'))
  if (!isRuntimePackageManifest(parsed)) {
    UserInput.fail(`Runtime package manifest ${path} must be an object with string patch paths.`)
  }
  return parsed
}

function isRuntimePackageManifest(value: unknown): value is RuntimePackageManifest {
  return isObjectRecord(value)
    && (!('patchedDependencies' in value) || isStringRecord(value.patchedDependencies))
}

function isStringRecord(value: unknown): value is PatchedDependencyPaths {
  return isObjectRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSupportedPatchPath(path: string): boolean {
  return path.startsWith('patches/') && !path.includes('\\') && !path.split('/').includes('..')
}
