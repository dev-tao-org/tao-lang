import { capture } from '../Processes'
import { readPackageMetadata } from '../Tooling/PackageResources'

/** readMetadata reads the installed Node addon headers' package identity. */
export function readMetadata(directory: string) {
  return readPackageMetadata('node-addon-api', directory)
}

const includeDirectoryExpression = 'require("node-addon-api").include_dir'
/** readIncludeDirectory asks the installed addon API for its compiler include directory. */
export function readIncludeDirectory(directory: string): Promise<string> {
  return capture('node -p', { variadicArgs: [includeDirectoryExpression], cwd: directory })
}
