import { RuntimeSourceDirectories, RuntimeSourceFiles } from '@runtime/RuntimeResources'
import { FileSystem, Path, Repo } from '@shared/os'

/** RuntimeSourcePaths maps packaged resource paths to their authored source paths. */
export type RuntimeSourcePaths = Record<string, string>

/** RuntimeSourceContents maps authored source paths to their captured text. */
export type RuntimeSourceContents = Record<string, string>

/** readRuntimeSources maps declared portable directories and files to their resource paths. */
export async function readRuntimeSources(
  directories: Readonly<RuntimeSourcePaths> = RuntimeSourceDirectories,
  files: Readonly<RuntimeSourcePaths> = RuntimeSourceFiles,
): Promise<RuntimeSourcePaths> {
  const resources: RuntimeSourcePaths = {}
  for (const [resourceDirectory, sourceDirectory] of Object.entries(directories)) {
    await addDirectorySources(resources, resourceDirectory, Repo.resolvePath(sourceDirectory))
  }
  for (const [resourcePath, sourcePath] of Object.entries(files)) {
    resources[resourcePath] = Repo.resolvePath(sourcePath)
  }
  return sortResources(resources)
}

async function addDirectorySources(
  resources: RuntimeSourcePaths,
  resourceDirectory: string,
  sourceRoot: string,
): Promise<void> {
  const sourcePaths = await FileSystem.listProductionSourceFiles(sourceRoot)
  for (const sourcePath of sourcePaths) {
    const relativePath = Path.relative(sourceRoot, sourcePath).replaceAll('\\', '/')
    const resourcePath = Path.posix.join(resourceDirectory, relativePath)
    resources[resourcePath] = sourcePath
  }
}

function sortResources(resources: RuntimeSourcePaths): RuntimeSourcePaths {
  const sortedResources: RuntimeSourcePaths = {}
  for (const resourcePath of Object.keys(resources).sort()) {
    sortedResources[resourcePath] = resources[resourcePath]!
  }
  return sortedResources
}
