import type { ModuleLoader } from '../../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node'
import { createRequire, join } from '../../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node'

/** createExpoLoader anchors package resolution in the installed application's Expo graph. */
export function createExpoLoader(directory: string): ModuleLoader {
  const application = createRequire(join(directory, 'package.json'))
  return createRequire(application.resolve('expo/package.json'))
}
