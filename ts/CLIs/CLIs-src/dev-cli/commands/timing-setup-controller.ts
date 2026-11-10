import { describeTimingSetup, type TimingSetupCommandOptions } from '../timing/TimingCommandOptions'
import { setupTiming } from '../timing/TimingSetup'
import { registerCommand } from './_command-runner'

/** timingSetupControllerCommand installs CLI-only private networking on the controlling Mac. */
export default registerCommand({
  name: 'timing-setup-controller',
  description: 'Install/start the pinned NetBird CLI service and sign in on this controller Mac.',
  options: [
    { flags: '--dry-run', description: 'Print the setup plan without changing the machine.' },
    { flags: '--no-browser', description: 'Print the NetBird sign-in URL instead of opening a browser.' },
  ],
  async action(options: TimingSetupCommandOptions) {
    const request = describeTimingSetup('controller', options)
    await setupTiming(request)
  },
})
