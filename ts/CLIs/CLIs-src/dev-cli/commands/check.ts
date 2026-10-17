import { runSteps } from '@cli-kit'
import { registerCommand, workspaceConformance, workspaceFormat, workspaceTypes } from './_command-runner'

/** checkCommand checks the TypeScript workspace. */
export default registerCommand({
  name: 'check',
  description: 'Check new workspace types, source conformance and formatting without running tests.',
  action: async () => {
    // Parser/app/IDE/runtime checks await their new implementations.
    await runSteps(
      () => workspaceTypes(),
      () => workspaceConformance(),
      () => workspaceFormat('check'),
    )
  },
})
