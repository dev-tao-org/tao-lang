import { resolveCallerPath } from '@cli-kit'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { updateTaoSource } from '../../dev-cli/source/TaoSource'
import { withProjectSessions } from '../ProjectCommand'

/** fmtCommand formats complete declarations in the requested Tao source files. */
export default registerCommand({
  name: 'fmt',
  description: 'Format Tao source files, preserving incomplete declarations.',
  arguments: [{ name: 'paths', required: true, variadic: true, description: 'Tao source files.' }],
  options: [{ flags: '--session <id>', description: 'Use a named project session lock.' }],
  async action(paths: string[], options: { session?: string } = {}) {
    const resolved = paths.map(resolveCallerPath)
    await withProjectSessions(resolved, async () => {
      for (const path of resolved) {
        await updateTaoSource(path, 'format')
      }
    }, options.session)
  },
})
