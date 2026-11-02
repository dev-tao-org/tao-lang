import { formatTimings, IO, resolveCallerPath } from '@cli-kit'
import { NewlineCharacter } from '@shared'
import { type CompileTarget, resolveCompileTarget } from '@workspace/CompileTarget'
import { prepareCompiledApplication, publishCompiledLibrary } from '../../tao-cli/CompileApplication'
import { registerCommand } from './_command-runner'

type CompileCommandOptions = { session?: string; yes?: boolean; package?: string }

/** compileCommand compiles an explicit Tao entry or a package-configured app or library target. */
export default registerCommand({
  name: 'compile',
  description: 'Compile a Tao entry file or a target configured by package.json tao.compile.',
  arguments: [{ name: 'target', description: 'Tao entry file or configured app/library declaration name.' }],
  options: [
    { flags: '--session <id>', description: 'Use an independent named session.' },
    { flags: '--yes', description: 'Authorize required dependency setup.' },
    { flags: '--package <directory>', description: 'Select the authored TypeScript package directory.' },
  ],
  async action(argument?: string, options: CompileCommandOptions = {}) {
    const target = await resolveCompileTarget(resolveCallerPath(options.package ?? '.'), argument)
    if (target.kind === 'library') {
      IO.print(await publishCompiledLibrary(target, options.session))
      return
    }
    await compileEntry(target, options.session, options.yes)
  },
})

async function compileEntry(target: CompileTarget, session?: string, yes?: boolean): Promise<void> {
  const workspace = await prepareCompiledApplication(target, session, yes)
  const result = workspace.initialResult
  await workspace.dispose()
  IO.print(`Compile ${result.revision}:${NewlineCharacter}  ${formatTimings(result.timings)}`)
  IO.print(workspace.runtime!.appPath)
}
