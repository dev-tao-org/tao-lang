import { runSteps } from '@cli-kit'
import {
  registerCommand,
  workspaceConformance,
  workspaceDeadExports,
  workspaceFormat,
  workspaceShellSyntax,
  workspaceTypes,
} from './_command-runner'

/** checkCommand checks the TypeScript workspace. */
export default registerCommand({
  name: 'check',
  description: 'Check new workspace types, source conformance, dead exports and formatting without running tests.',
  async action() {
    // Parser/app/IDE/runtime checks await their new implementations.
    await runSteps(
      () => workspaceTypes(),
      () => workspaceShellSyntax(),
      () => workspaceConformance(),
      () => workspaceDeadExports(),
      () => workspaceFormat('check'),
    )
  },
})
