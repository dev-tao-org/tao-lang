import { configureCLIOutput } from '@cli-kit'
import '../dev-cli/commands/compile'
import './commands/test'
import './commands/fmt'
import './commands/fix'
import { execute } from '../dev-cli/commands/_command-runner'

await configureCLIOutput('tao')
await execute('tao')
