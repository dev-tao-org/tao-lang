import { buildDevExtension } from './DevExtensionBuild'
import { buildExtension } from './ExtensionBuild'

/** buildExtensions builds language support and repository tools as independent VSIX packages. */
export async function buildExtensions(): Promise<string[]> {
  return [await buildExtension(), await buildDevExtension()]
}
