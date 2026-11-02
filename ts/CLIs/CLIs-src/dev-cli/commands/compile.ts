import { formatTimings, IO, resolveCallerPath } from '@cli-kit'
import { NewlineCharacter } from '@shared'
import { execute } from '@workspace/Workflow'
import { prepareNativeLocks } from '../../cli-checks/native-lock-build'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { workflowUI } from '../../tao-cli/WorkflowUI'
import { registerCommand } from './_command-runner'

/** compileCommand compiles an entry file into an isolated Expo runtime. */
export default registerCommand({
  name: 'compile',
  description: 'Compile a Tao app entry file into a generated Expo runtime.',
  arguments: [{ name: 'entry', required: true, description: 'Tao app entry file.' }],
  options: [
    { flags: '--session <id>', description: 'Use an independent named session.' },
    { flags: '--yes', description: 'Authorize required dependency setup.' },
  ],
  async action(entry: string, options: { session?: string; yes?: boolean } = {}) {
    await prepareNativeLocks()
    await prepareRuntime()
    await compileEntry(resolveCallerPath(entry), options.session, options.yes)
  },
})

async function compileEntry(entry: string, session?: string, yes?: boolean): Promise<void> {
  const workspace = await execute({ kind: 'compile', entry, options: { id: session } }, workflowUI(yes))
  const result = workspace.initialResult
  await workspace.dispose()
  IO.print(`Compile ${result.revision}:${NewlineCharacter}  ${formatTimings(result.timings)}`)
  IO.print(workspace.runtime!.appPath)
}
