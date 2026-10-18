import { formatTimings, IO } from '@cli-kit'
import { Errors } from '@shared'
import { Repo } from '@shared/os'
import { createProject, createWorkspace } from '@workspace/Workspace'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { registerCommand } from './_command-runner'

/** compileCommand compiles an entry file into an isolated Expo runtime. */
export default registerCommand({
  name: 'compile',
  description: 'Compile a Tao app entry file into a generated Expo runtime.',
  arguments: [{ name: 'entry', required: true, description: 'Tao app entry file.' }],
  async action(entry: string) {
    await prepareRuntime()
    const project = await createProject()
    const workspace = createWorkspace({ project })
    const result = await workspace.updateFile(Repo.resolvePath(entry))
    workspace.dispose()
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
  },
})
