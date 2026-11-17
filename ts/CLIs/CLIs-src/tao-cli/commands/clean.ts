import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { UserInput } from '@shared'
import { Storage } from '@shared/os'
import * as Workspace from '@workspace'

import { registerCommand } from '../../dev-cli/commands/_command-runner'

/** taoCleanCommand removes generated state for the current Tao project. */
export default registerCommand({
  name: 'clean',
  description: 'Remove inactive project cache; --wipe also removes the shared Tao cache.',
  arguments: [{ name: 'path', defaultValue: '.', description: 'Project directory or file.' }],
  options: [{ flags: '--wipe', description: 'Also remove the shared Tao cache when no consumers are active.' }],
  async action(path: string, options: { wipe?: boolean } = {}) {
    const project = await Workspace.discoverProject(CLIKit.resolveCallerPath(path))
    if (!project) {
      UserInput.fail(`No Tao project was found from ${CLIKit.resolveCallerPath(path)}.`)
    }
    const result = await Workspace.cleanProject(project.root)
    for (const warning of result.warnings) {
      IO.warn(warning)
    }
    IO.print(`Removed ${result.removed.length} inactive project cache entries.`)
    reportActiveSessions(result.skippedActive, result.sharedProtected)
    if (options.wipe) {
      const cleaned = await Storage.cleanSharedCache(reason => IO.warn(reason))
      if (cleaned) {
        IO.print('Removed shared Tao cache entries.')
      } else {
        IO.print('Preserved shared Tao cache; see the protection details above.')
      }
    }
  },
})

function reportActiveSessions(sessions: string[], sharedProtected: boolean): void {
  if (sessions.length > 0) {
    IO.print(`Skipped active sessions: ${sessions.join(', ')}`)
  }
  if (sharedProtected) {
    IO.print('Preserved project cache while session ownership was uncertain.')
  }
}
