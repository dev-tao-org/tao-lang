import { Path } from '@shared/os'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { updateTaoSource } from '../../dev-cli/source/TaoSource'

/** fixCommand organizes imports and then formats complete Tao source files. */
export default registerCommand({
  name: 'fix',
  description: 'Organize imports and format complete Tao source files.',
  arguments: [{ name: 'paths', required: true, variadic: true, description: 'Tao source files.' }],
  async action(paths: string[]) {
    for (const path of paths) {
      await updateTaoSource(Path.resolve(path), 'fix')
    }
  },
})
