import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { Artifacts, FileSystem, Repo } from '@shared/os'
import { registerCommand } from './_command-runner'

/** cleanCommand removes dependencies, all artifacts, or only expired successful temporary output. */
export default registerCommand({
  name: 'clean',
  description:
    'Remove dependencies; --full includes artifacts, --partial removes successful temporary output older than 24h.',
  arguments: [{ name: 'args', description: 'Optional --full or --partial flag.', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    if (!hasValidCleanArguments(args)) {
      Errors.ThrowUserInput('Usage: clean [--full | --partial]')
    }
    if (args.includes('--partial')) {
      const removed = await Artifacts.cleanPartial()
      IO.print(`Removed ${removed} temporary artifacts; retained caches, recent output, failures and active runs.`)
      return
    }
    await FileSystem.rm(Repo.resolvePath('ts/1-grammar/_gen_parser'), { recursive: true, force: true })
    await FileSystem.rm(Repo.resolvePath('ts/7-runtime/_gen_runtime'), { recursive: true, force: true })
    await FileSystem.rm(Repo.resolvePath('ts/node_modules'), { recursive: true, force: true })
    if (args.includes('--full')) {
      await Artifacts.rm(Artifacts.resolvePath(), { recursive: true, force: true })
    }
  },
})

function hasValidCleanArguments(args: readonly string[]): boolean {
  return args.length <= 1 && args.every(argument => argument === '--full' || argument === '--partial')
}
