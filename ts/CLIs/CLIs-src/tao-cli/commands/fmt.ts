import { Path } from '@shared/os'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { updateTaoSource } from '../../dev-cli/source/TaoSource'

/** fmtCommand formats complete declarations in the requested Tao source files. */
export default registerCommand({
  name: 'fmt',
  description: 'Format Tao source files, preserving incomplete declarations.',
  arguments: [{ name: 'paths', required: true, variadic: true, description: 'Tao source files.' }],
  async action(paths: string[]) {
    for (const path of paths) {
      await updateTaoSource(Path.resolve(path), 'format')
    }
  },
})
