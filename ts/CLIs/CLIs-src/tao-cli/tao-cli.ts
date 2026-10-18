import '../dev-cli/commands/compile'
import './commands/test'
import './commands/fmt'
import './commands/fix'
import { execute } from '../dev-cli/commands/_command-runner'

await execute('tao')
