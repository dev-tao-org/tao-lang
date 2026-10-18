import { runCommand } from '@cli-kit'
import { FileSystem, Path, Repo } from '@shared/os'
import { registerCommand } from './_command-runner'

/** setupCommand installs the TypeScript development workspace dependencies. */
export default registerCommand({
  name: 'setup',
  description: 'Install the TypeScript development workspace dependencies.',
  arguments: [{ name: 'args', description: 'Bun install arguments.', variadic: true }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    // Keep registration dependency-free; load build tooling only after installation succeeds.
    await runCommand('bun install', { variadicArgs: args })
    const { prepareParser } = await import('../../cli-checks/parser-build')
    await prepareParser()
    await ensureShellCompletionCache()
    const { runDirenvSetup } = await import('../shell/DirenvSetup')
    await runDirenvSetup({ prepare: true })
  },
})

async function ensureShellCompletionCache(): Promise<void> {
  const cache = Repo.resolvePath('.artifacts/cache/dev-shell')
  const completion = Path.resolve(cache, 'completion.zsh')
  if (FileSystem.existsSync(completion)) {
    return
  }
  await FileSystem.mkdir(cache, { recursive: true })
  await FileSystem.writeFile(
    completion,
    '# Tao dev shell completion is generated during ./agent setup.\n',
    'utf8',
  )
}
