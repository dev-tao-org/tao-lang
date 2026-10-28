import { RuntimeSourceDirectories, RuntimeSourceFiles } from '@runtime/RuntimeResources'
import { Regxs } from '@shared'
import { FileSystem, Path, Repo } from '@shared/os'

/** readRuntimeSources maps declared portable directories and files to their resource paths. */
export async function readRuntimeSources(
  directories: Readonly<Record<string, string>> = RuntimeSourceDirectories,
  files: Readonly<Record<string, string>> = RuntimeSourceFiles,
): Promise<Record<string, string>> {
  const resources: Record<string, string> = {}
  for (const [resourceDirectory, sourceDirectory] of Object.entries(directories)) {
    await addDirectorySources(resources, resourceDirectory, Repo.resolvePath(sourceDirectory))
  }
  for (const [resourcePath, sourcePath] of Object.entries(files)) {
    resources[resourcePath] = Repo.resolvePath(sourcePath)
  }
  return sortResources(resources)
}

async function addDirectorySources(
  resources: Record<string, string>,
  resourceDirectory: string,
  sourceRoot: string,
): Promise<void> {
  const sourcePaths = await FileSystem.listSourceFiles(sourceRoot)
  for (const sourcePath of sourcePaths) {
    if (isRuntimeTestSource(sourceRoot, sourcePath)) {
      continue
    }
    const relativePath = Path.relative(sourceRoot, sourcePath).replaceAll('\\', '/')
    const resourcePath = Path.posix.join(resourceDirectory, relativePath)
    resources[resourcePath] = sourcePath
  }
}

function isRuntimeTestSource(sourceRoot: string, sourcePath: string): boolean {
  const relativePath = Path.relative(sourceRoot, sourcePath).replaceAll('\\', '/')
  return relativePath.split('/').some(segment => segment.endsWith('-test'))
    || Regxs.TestSourceSuffix.test(relativePath)
}

function sortResources(resources: Record<string, string>): Record<string, string> {
  const sortedResources: Record<string, string> = {}
  for (const resourcePath of Object.keys(resources).sort()) {
    sortedResources[resourcePath] = resources[resourcePath]!
  }
  return sortedResources
}
