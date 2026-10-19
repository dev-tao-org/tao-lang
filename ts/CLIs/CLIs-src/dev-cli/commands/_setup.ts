import { installWorkspace } from '../../../../shared/shared-src/os/Bootstrap'

// This entry must not load the CLI or workspace dependency graph before installation.
installWorkspace()
