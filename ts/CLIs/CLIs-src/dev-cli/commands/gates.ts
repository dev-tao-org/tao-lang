import { registerCommand, runLegacyDev } from './_command-runner'

/** gatesCommand runs an explicit gate graph through the retained verification engine. */
export const gatesCommand = registerCommand({
  name: 'gates',
  description: 'Run explicitly named legacy verification gates and preserve their reports.',
  arguments: [{ name: 'args', required: true, variadic: true }],
  allowUnknownOptions: true,
  action: async (args: string[]) => {
    // New parser/app/IDE/runtime gates await their implementations; the reference owns this catalog.
    process.exitCode = await runLegacyDev(['gates', ...args])
  },
})
