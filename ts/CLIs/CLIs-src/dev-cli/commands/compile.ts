import { formatTimings, IO, resolveCallerPath } from '@cli-kit'
import { Errors, Try } from '@shared'
import { openProjectWorkspace } from '@workspace/ProjectWorkspace'
import { prepareNativeLocks } from '../../cli-checks/native-lock-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { compileWithPreparation } from '../../tao-cli/CompilationPreparation'
import { registerCommand } from './_command-runner'

/** compileCommand compiles an entry file into an isolated Expo runtime. */
export default registerCommand({
  name: 'compile',
  description: 'Compile a Tao app entry file into a generated Expo runtime.',
  arguments: [{ name: 'entry', required: true, description: 'Tao app entry file.' }],
  options: [{ flags: '--session <id>', description: 'Use an independent named session.' }],
  async action(entry: string, options: { session?: string } = {}) {
    await prepareNativeLocks()
    await prepareRuntime()
    await compileWithPreparation(resolveCallerPath(entry), options.session, async () => {
      await compileEntry(resolveCallerPath(entry), options.session)
    })
  },
})

async function compileEntry(entry: string, session?: string): Promise<void> {
  const workspace = await openProjectWorkspace(entry, { id: session })
  const result = await Try(() => workspace.files.compileFile(entry), { finally: () => workspace.dispose() })
  IO.print(`Compile ${result.revision}:\n  ${formatTimings(result.timings)}`)
  if (result.status === 'failed') {
    Errors.ThrowUnexpected(`Compilation failed: ${entry}\n${result.error}`)
  }
  if (result.status === 'invalid') {
    Errors.ThrowUserInput(`Compilation invalid: ${entry}`)
  }
  if (result.status === 'superseded') {
    Errors.ThrowUnexpected(`Compilation superseded: ${entry}`)
  }
  IO.print(workspace.runtime!.appPath)
}
