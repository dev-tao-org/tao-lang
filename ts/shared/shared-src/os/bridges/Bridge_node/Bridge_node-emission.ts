import { S } from '../../../universal/S'

/** metroImports emits Node imports required by the isolated Metro configuration. */
export const metroImports = S`
  const path = require('node:path');
  const fs = require('node:fs');
`

/** bundleBanner emits Node's CJS import-meta URL boundary. */
export const bundleBanner = 'const __taoImportMetaUrl = require("node:url").pathToFileURL(__filename).href;'

/** nodeMetadataProbe reads the Node executable and ABI environment in an isolated process. */
export const nodeMetadataProbe =
  'JSON.stringify({version:process.version,executable:process.execPath,architecture:process.arch,platform:process.platform})'
