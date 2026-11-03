import { readPackageMetadata } from '../Tooling/PackageResources'

/** readMetadata reads the exact native addon builder package identity. */
export function readMetadata(directory: string) {
  return readPackageMetadata('node-gyp', directory)
}
