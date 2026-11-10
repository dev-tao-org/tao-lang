import * as Process from '../../../../shared/shared-src/os/Process/Process-Current'
import { installWorkspace } from '../../../../shared/shared-src/os/Tooling/Bootstrap'

// This entry must not load the CLI or workspace dependency graph before installation.
const setupArgs = Process.argv.slice(Process.argv[2] === '--agent' ? 3 : 2)
await installWorkspace('./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts', setupArgs)
