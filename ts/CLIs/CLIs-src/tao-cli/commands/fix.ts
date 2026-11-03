import * as CLIKit from '@cli-kit'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { updateTaoSource } from '../../dev-cli/source/TaoSource'
import { withProjectSessions } from '../ProjectCommand'

/** fixCommand organizes imports and then formats complete Tao source files. */
export default registerCommand({
  name: 'fix',
  description: 'Organize imports and format complete Tao source files.',
  arguments: [{ name: 'paths', required: true, variadic: true, description: 'Tao source files.' }],
  options: [{ flags: '--session <id>', description: 'Use a named project session lock.' }],
  async action(paths: string[], options: { session?: string } = {}) {
    const resolved = paths.map(CLIKit.resolveCallerPath)
    await withProjectSessions(resolved, async () => {
      for (const path of resolved) {
        await updateTaoSource(path, 'fix')
      }
    }, options.session)
  },
})
