import { configureCLIOutput } from '@cli-kit'
import '../dev-cli/commands/compile'
import './commands/test'
import './commands/fmt'
import './commands/fix'
import './commands/init'
import './commands/clean'
import './commands/add'
import './commands/setup'
import './commands/update'
import './commands/test-sidecars'
import { execute } from '../dev-cli/commands/_command-runner'

await configureCLIOutput('tao')
await execute('tao')
