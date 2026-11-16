import { Regxs } from '@shared'
import { FileWatch } from '@shared/os'

/** watchSourceTree observes authored paths using the workspace's source exclusions. */
export function watchSourceTree(
  directory: string,
  onChange: (change: FileWatch.FileChange) => void,
  onError: (error: unknown) => void,
  ignoredDirectories: readonly string[] = [],
  additionalDirectories: readonly string[] = [],
): Promise<FileWatch.Watcher> {
  return FileWatch.watchTree(directory, onChange, onError, {
    additionalDirectories,
    ignoredDirectories,
    ignorePath: isIgnoredSourcePath,
  })
}

function isIgnoredSourcePath(relativePath: string): boolean {
  return relativePath.split(Regxs.PathSeparatorRegx).some(isIgnoredSourceName)
}

const HiddenPrefix = '.'
const GeneratedPrefix = '_gen_'
const InstalledDependencies = 'node_modules'

function isIgnoredSourceName(name: string): boolean {
  return name.startsWith(HiddenPrefix) || name.startsWith(GeneratedPrefix) || name === InstalledDependencies
}
