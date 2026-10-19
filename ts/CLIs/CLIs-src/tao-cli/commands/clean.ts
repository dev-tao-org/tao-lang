import { IO, resolveCallerPath } from '@cli-kit'
import { Errors } from '@shared'
import { Storage } from '@shared/os'
import { cleanProject } from '@workspace/projects/Clean'
import { discoverProject } from '@workspace/projects/Projects'
import { registerCommand } from '../../dev-cli/commands/_command-runner'

/** taoCleanCommand removes generated state for the current Tao project. */
export default registerCommand({
  name: 'clean',
  description: 'Remove inactive project cache; --wipe also removes the shared Tao cache.',
  arguments: [{ name: 'path', defaultValue: '.', description: 'Project directory or file.' }],
  options: [{ flags: '--wipe', description: 'Also remove the shared Tao cache when no consumers are active.' }],
  async action(path: string, options: { wipe?: boolean } = {}) {
    const project = await discoverProject(resolveCallerPath(path))
    if (!project) {
      Errors.ThrowUserInput(`No Tao project was found from ${resolveCallerPath(path)}.`)
    }
    const result = await cleanProject(project.root)
    IO.print(`Removed ${result.removed.length} inactive project cache entries.`)
    reportActiveSessions(result.skippedActive, result.sharedProtected)
    if (options.wipe) {
      const cleaned = await Storage.cleanSharedCache()
      if (cleaned) {
        IO.print('Removed shared Tao cache entries.')
      } else {
        IO.print('Preserved shared Tao cache because active consumers are using it.')
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
