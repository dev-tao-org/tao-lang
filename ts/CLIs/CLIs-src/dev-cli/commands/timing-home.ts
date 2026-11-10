import * as CLIKit from '@cli-kit'
import { initializeTimingHome, type TimingHome } from '../timing/TimingHome'
import { registerCommand } from './_command-runner'

/** timingHomeCommand initializes the existing developer home for LAN timing without installing network software. */
export default registerCommand({
  name: 'timing-home',
  description: 'Initialize ~/.tao-dev timing storage and optionally import collected reports.',
  options: [
    {
      flags: '--import-reports <directory>',
      description: 'Copy collected reports without replacing existing evidence.',
    },
    { flags: '--dry-run', description: 'Print paths and planned import without changing files.' },
  ],
  async action(options: TimingHome) {
    await initializeTimingHome(resolveHomeOptions(options))
  },
})

function resolveHomeOptions(options: TimingHome): TimingHome {
  if (options.importReports === undefined) {
    return options
  }
  return { ...options, importReports: CLIKit.resolveCallerPath(options.importReports) }
}
