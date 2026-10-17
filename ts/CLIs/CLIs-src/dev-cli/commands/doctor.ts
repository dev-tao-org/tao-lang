import { registerCommand, runLegacyRecipe } from './_command-runner'

/** doctorCommand preserves reference checkout diagnostics and structured output. */
export const doctorCommand = registerCommand({
  name: 'doctor',
  description: 'Diagnose the reference checkout; accepts --json.',
  arguments: [{ name: 'args', variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    // Studio, native toolchain and runtime diagnostics remain scoped to the reference implementation.
    process.exitCode = await runLegacyRecipe(['doctor', ...args])
  },
})
