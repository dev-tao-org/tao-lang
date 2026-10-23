import type { RuntimeApplication } from '@runtime/Runtime'
import { Errors, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'

/** prepareBuildTypeScript gives generated build sources the runtime's aliases and pinned dependencies.
 *  Call once when preparing the runtime, outside ordinary source refreshes. */
export async function prepareBuildTypeScript(buildDirectory: string, runtime: RuntimeApplication): Promise<void> {
  await FileSystem.mkdir(buildDirectory, { recursive: true })
  const runtimeConfig = Path.relative(buildDirectory, Path.join(runtime.directory, 'tsconfig.json'))
    .replaceAll('\\', '/')
  const configuration = {
    extends: runtimeConfig.startsWith('.') ? runtimeConfig : `./${runtimeConfig}`,
    include: ['./**/*.ts', './**/*.tsx'],
  }
  await FileSystem.writeIfChanged(
    Path.join(buildDirectory, 'tsconfig.json'),
    JSON.stringify(configuration, null, 2) + '\n',
  )
  await linkBuildDependencies(buildDirectory, runtime.directory)
}

async function linkBuildDependencies(buildDirectory: string, runtimeDirectory: string): Promise<void> {
  const link = Path.join(buildDirectory, 'node_modules')
  const target = Path.join(runtimeDirectory, 'node_modules')
  const existing = Try.WithDefault(undefined, () => FileSystem.lstatSync(link))
  if (existing && !existing.isSymbolicLink()) {
    Errors.ThrowUserInput(`Generated build dependency path is not a symbolic link: ${link}`)
  }
  const relativeTarget = Path.relative(buildDirectory, target)
  await FileSystem.replaceDirectoryLink(relativeTarget, link)
}
