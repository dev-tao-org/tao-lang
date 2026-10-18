import { IO } from '@cli-kit'
import { Errors } from '@shared'
import { Repo } from '@shared/os'
import { createProject, createWorkspace } from '@workspace/Workspace'
import { registerCommand } from './_command-runner'

/** compileCommand compiles an entry file into an isolated generated Expo project. */
export default registerCommand({
  name: 'compile',
  description: 'Compile a Tao app entry file into a generated Expo project.',
  arguments: [{ name: 'entry', required: true, description: 'Tao app entry file.' }],
  async action(entry: string) {
    const project = await createProject()
    const workspace = createWorkspace({ project })
    const result = await workspace.updateFile(Repo.resolvePath(entry))
    workspace.dispose()
    if (result.status !== 'published') {
      Errors.ThrowUserInput(`Compilation ${result.status}: ${entry}`)
    }
    IO.print(project.appPath)
  },
})
