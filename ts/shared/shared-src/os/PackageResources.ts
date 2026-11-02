import { Errors } from '../universal/universal'
import * as FileSystem from './FileSystem'
import * as Path from './Path'

/** PackageMetadata identifies the exact installed package used by a toolchain source bridge. */
export type PackageMetadata = { root: string; version: string }
/** readPackageMetadata reads and validates an installed package from an explicitly selected graph. */
export async function readPackageMetadata(packageName: string, fromDirectory: string): Promise<PackageMetadata> {
  const root = FileSystem.resolvePackageDirectory(packageName, fromDirectory)
  if (!root) {
    Errors.ThrowHostEnvironment(`Cannot locate the installed package ${packageName}.`)
  }
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(root, 'package.json'), 'utf8')) as {
    name?: string
    version?: string
  }
  if (manifest.name !== packageName || !manifest.version) {
    Errors.ThrowHostEnvironment(`Installed package metadata is invalid for ${packageName}.`)
  }
  return { root, version: manifest.version }
}
