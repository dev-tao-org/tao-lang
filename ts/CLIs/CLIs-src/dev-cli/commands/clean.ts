import { Errors } from '@shared'
import { Artifacts, FileSystem, Repo } from '@shared/os'
import { registerCommand } from './_command-runner'

/** cleanCommand removes workspace dependencies and, with --full, shared checkout artifacts. */
export default registerCommand({
  name: 'clean',
  description: 'Remove new workspace dependencies; --full also removes the checkout .artifacts directory.',
  arguments: [{ name: 'args', description: 'Optional --full flag.', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    if (args.some(argument => argument !== '--full')) {
      Errors.ThrowUserInput('Usage: clean [--full]')
    }
    // New parser/app/IDE/native build trees do not exist yet.
    await FileSystem.rm(Repo.resolvePath('ts/node_modules'), { recursive: true, force: true })
    if (args.includes('--full')) {
      await Artifacts.rm(Artifacts.resolvePath(), { recursive: true, force: true })
    }
  },
})
