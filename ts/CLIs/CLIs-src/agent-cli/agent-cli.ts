import { setAgentIO } from '@cli-kit'
import '../dev-cli/dev-cli'
import { execute } from '../dev-cli/commands/_command-runner'

setAgentIO()
await execute('agent')
