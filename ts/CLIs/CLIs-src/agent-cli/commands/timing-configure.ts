import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { configureTimingRunner } from '../../dev-cli/timing/TimingRunnerConfiguration'

/** timingConfigureCommand verifies and saves a prepared timing runner for later runs. */
export default registerCommand({
  name: 'timing-configure',
  description: 'Verify SSH access to prepared timing tooling and save the default runner.',
  arguments: [
    { name: 'host', required: true, description: 'Existing SSH alias or user@hostname.' },
    { name: 'tooling', required: true, description: 'Absolute path to the prepared tooling checkout on the runner.' },
  ],
  async action(host: string, tooling: string) {
    await configureTimingRunner({ host, tooling })
  },
})
