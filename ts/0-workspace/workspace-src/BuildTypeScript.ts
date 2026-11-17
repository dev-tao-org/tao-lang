import type * as Runtime from '@runtime'
import { Json, UserInput } from '@shared'
import { NewlineCharacter, Try } from '@shared'
import { FS, Path } from '@shared/os'

/** prepareBuildTypeScript gives generated build sources the runtime's aliases and pinned dependencies.
 *  Call once when preparing the runtime, outside ordinary source refreshes. */
export async function prepareBuildTypeScript(
  buildDirectory: string,
  runtime: Runtime.RuntimeApplication,
): Promise<void> {
  await FS.mkdir(buildDirectory)
  const runtimeConfig = Path.relative(buildDirectory, Path.join(runtime.directory, 'tsconfig.json'))
    .replaceAll('\\', '/')
  const configuration = {
    extends: Path.toRelativeModuleSpecifier(runtimeConfig),
    include: ['./**/*.ts', './**/*.tsx'],
  }
  await FS.writeIfChanged(
    Path.join(buildDirectory, 'tsconfig.json'),
    serializeBuildTypeScriptConfiguration(configuration),
  )
  await linkBuildDependencies(buildDirectory, runtime.directory)
}

type BuildTypeScriptConfiguration = { extends: string; include: string[] }
function serializeBuildTypeScriptConfiguration(configuration: BuildTypeScriptConfiguration): string {
  return `${Json.Print(configuration)}${NewlineCharacter}`
}

async function linkBuildDependencies(buildDirectory: string, runtimeDirectory: string): Promise<void> {
  const link = Path.join(buildDirectory, 'node_modules')
  const target = Path.join(runtimeDirectory, 'node_modules')
  const existing = Try.WithDefault(undefined, () => FS.lstatSync(link))
  if (existing && !existing.isSymbolicLink()) {
    UserInput.fail(`Generated build dependency path is not a symbolic link: ${link}`)
  }
  const relativeTarget = Path.relative(buildDirectory, target)
  await FS.replaceDirectoryLink(relativeTarget, link)
}
