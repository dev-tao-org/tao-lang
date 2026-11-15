import * as Process from '../../../../shared/shared-src/os/Process/Process-Current'
import { installWorkspace, requireAllowedSetup } from '../../../../shared/shared-src/os/Tooling/Bootstrap'

// This entry must not load the CLI or workspace dependency graph before installation.
const agentSetup = Process.argv[2] === '--agent'
if (agentSetup) {
  const { default: hostOperations } = await import('../../../../../.config/agent-host-commands.json')
  requireAllowedSetup(hostOperations)
}
const setupArgs = Process.argv.slice(agentSetup ? 3 : 2)
await installWorkspace('./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts', setupArgs)
