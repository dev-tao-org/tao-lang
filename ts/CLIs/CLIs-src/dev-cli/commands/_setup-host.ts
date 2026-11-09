import { installHostWorkspace } from '../../../../shared/shared-src/os/Tooling/Bootstrap'

// Host setup must validate access before installation without loading workspace dependencies.
await installHostWorkspace('./CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts')
