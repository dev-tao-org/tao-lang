import { installWorkspace } from '../../../../shared/shared-src/os/Tooling/Bootstrap'

// This entry must not load the CLI or workspace dependency graph before installation.
await installWorkspace('./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts')
