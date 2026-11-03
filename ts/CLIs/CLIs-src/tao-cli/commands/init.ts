import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import * as Workspace from '@workspace'

import { registerCommand } from '../../dev-cli/commands/_command-runner'

type InitCommandOptions = { library?: boolean }

/** initCommand initializes a Tao project or scaffolds a TypeScript library consumer. */
export default registerCommand({
  name: 'init',
  description: 'Initialize a Tao project, optionally with a TypeScript library consumer.',
  arguments: [{ name: 'path', required: true, description: 'Project directory.' }],
  options: [{ flags: '--library', description: 'Scaffold a Tao TypeScript library and React consumer.' }],
  async action(path: string, options: InitCommandOptions = {}) {
    const target = CLIKit.resolveCallerPath(path)
    if (options.library) {
      const project = await Workspace.initializeLibraryProject(target)
      IO.print(`Initialized Tao library project: ${project.root}`)
    } else {
      const project = await Workspace.initializeProject(target)
      IO.print(`Initialized Tao project: ${project.root}`)
    }
  },
})
