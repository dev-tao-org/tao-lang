import { Errors } from '@shared'
import { FS, Path } from '@shared/os'

/** readLicense reads the formatter wrapper's installed license from its owning graph. */
export async function readLicense(fromDirectory: string): Promise<string> {
  const directory = FS.resolvePackageDirectory('@dprint/formatter', fromDirectory)
  if (!directory) {
    Errors.ThrowHostEnvironment('Cannot locate the installed @dprint/formatter package for extension licensing.')
  }
  return await FS.readFile(Path.join(directory, 'LICENSE'), 'utf8')
}
