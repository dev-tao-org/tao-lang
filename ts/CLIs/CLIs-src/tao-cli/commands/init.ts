import { IO, resolveCallerPath } from '@cli-kit'
import { initializeProject } from '@workspace/projects/Projects'
import { registerCommand } from '../../dev-cli/commands/_command-runner'

/** initCommand initializes a Tao project without changing its authored sources. */
export default registerCommand({
  name: 'init',
  description: 'Initialize a Tao project, rejecting nested projects.',
  arguments: [{ name: 'path', required: true, description: 'Project directory.' }],
  async action(path: string) {
    const project = await initializeProject(resolveCallerPath(path))
    IO.print(`Initialized Tao project: ${project.root}`)
  },
})
