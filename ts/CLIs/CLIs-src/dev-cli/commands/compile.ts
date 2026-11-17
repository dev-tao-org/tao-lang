import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { NewlineCharacter, UserInput } from '@shared'
import * as Workspace from '@workspace'

import { prepareCompiledApplication, publishCompiledLibrary } from '../../tao-cli/CompileApplication'
import { registerCommand } from './_command-runner'

type CompileCommandOptions = { session?: string; yes?: boolean; package?: string; tsLib?: string; out?: string }

/** compileCommand compiles an explicit Tao entry or a package-configured app or library target. */
export default registerCommand({
  name: 'compile',
  description: 'Compile a Tao entry file or a target configured by package.json tao.compile.',
  arguments: [{ name: 'target', description: 'Tao entry file or configured app/library declaration name.' }],
  options: [
    { flags: '--session <id>', description: 'Use an independent named session.' },
    { flags: '--yes', description: 'Authorize required dependency setup.' },
    { flags: '--package <directory>', description: 'Select the authored TypeScript package directory.' },
    { flags: '--ts-lib <declaration>', description: 'Select a ts-library for explicit output.' },
    { flags: '--out <directory>', description: 'Write the TypeScript library into a fresh directory.' },
  ],
  async action(argument?: string, options: CompileCommandOptions = {}) {
    const directory = CLIKit.resolveCallerPath(options.package ?? '.')
    if (options.tsLib || options.out) {
      await compileExplicitLibrary(directory, argument, options)
      return
    }
    const target = await Workspace.resolveCompileTarget(directory, argument)
    if (target.kind === 'library') {
      IO.print(await publishCompiledLibrary(target, options.session))
      return
    }
    await compileEntry(target, options.session, options.yes)
  },
})

type EntryArgument = string | undefined

async function compileExplicitLibrary(directory: string, argument: EntryArgument, options: CompileCommandOptions) {
  UserInput.require(!(!options.tsLib || !options.out), 'Use --ts-lib <declaration> together with --out <directory>.')
  const entry = argument === undefined ? undefined : CLIKit.resolveCallerPath(argument)
  const target = await Workspace.resolveLibraryCompileTarget(directory, options.tsLib, entry)
  const output = CLIKit.resolveCallerPath(options.out)
  IO.print(await publishCompiledLibrary(target, options.session, output))
}

async function compileEntry(target: Workspace.CompileTarget, session?: string, yes?: boolean): Promise<void> {
  const workspace = await prepareCompiledApplication(target, session, yes)
  const result = workspace.initialResult
  await workspace.dispose()
  IO.print(`Compile ${result.revision}:${NewlineCharacter}  ${CLIKit.formatTimings(result.timings)}`)
  IO.print(workspace.runtime!.appPath)
}
