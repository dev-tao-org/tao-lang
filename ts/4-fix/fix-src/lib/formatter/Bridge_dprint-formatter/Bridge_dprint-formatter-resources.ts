import { Errors } from '@shared'
import { FileSystem, Path } from '@shared/os'

/** readLicense reads the formatter wrapper's installed license from its owning graph. */
export async function readLicense(fromDirectory: string): Promise<string> {
  const directory = FileSystem.resolvePackageDirectory('@dprint/formatter', fromDirectory)
  if (!directory) {
    Errors.ThrowHostEnvironment('Cannot locate the installed @dprint/formatter package for extension licensing.')
  }
  return await FileSystem.readFile(Path.join(directory, 'LICENSE'), 'utf8')
}
