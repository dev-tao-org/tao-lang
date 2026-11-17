import type * as Runtime from '@runtime'
import * as Expo from '@runtime/expo'
import { Try, UserInput } from '@shared'
import { FS, Path } from '@shared/os'

/** prepareBuildTypeScript gives generated build sources the runtime's aliases and pinned dependencies.
 *  Call once when preparing the runtime, outside ordinary source refreshes. */
export async function prepareBuildTypeScript(
  buildDirectory: string,
  runtime: Runtime.RuntimeApplication,
): Promise<void> {
  await FS.mkdir(buildDirectory)
  await FS.writeIfChanged(
    Path.join(buildDirectory, 'tsconfig.json'),
    Expo.serializeAppBuildTypeScriptConfig(runtime.directory),
  )
  await linkBuildDependencies(buildDirectory, runtime.directory)
}

async function linkBuildDependencies(buildDirectory: string, runtimeDirectory: string): Promise<void> {
  const link = Path.join(buildDirectory, 'node_modules')
  const target = Path.join(runtimeDirectory, 'node_modules')
  const existing = Try.WithDefault(undefined, () => FS.lstatSync(link))
  if (existing && !existing.isSymbolicLink()) {
    UserInput.Fail(`Generated build dependency path is not a symbolic link: ${link}`)
  }
  const relativeTarget = Path.relative(buildDirectory, target)
  await FS.replaceDirectoryLink(relativeTarget, link)
}
