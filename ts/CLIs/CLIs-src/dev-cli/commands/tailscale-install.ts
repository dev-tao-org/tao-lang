import { installTailscale } from '../TailscaleInstall'
import { registerCommand } from './_command-runner'

/** tailscaleInstallCommand installs the official macOS app and explains the remaining native setup. */
export default registerCommand({
  name: 'tailscale-install',
  description: 'Install the official standalone Tailscale macOS app using administrator authorization.',
  options: [{
    flags: '--dry-run',
    description: 'Resolve the official stable package without downloading or installing it.',
  }],
  async action(options: { dryRun?: boolean }) {
    await installTailscale(options.dryRun ?? false)
  },
})
