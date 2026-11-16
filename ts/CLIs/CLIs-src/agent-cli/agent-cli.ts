import { Process } from '@shared/os'
import '../cli-kit/fatal-errors'
import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'

import './commands/push'
import './commands/skill-script'
import './commands/ssh-key-setup'
import './commands/timing-compare'
import './commands/timing-configure'
import './commands/timing-connect'
import './commands/timing-disconnect'
import './commands/timing-home'
import './commands/timing-report'
import './commands/timing-session'
import './commands/timing-watch'
import unsandboxed from './commands/unsandboxed'
import '../dev-cli/dev-cli'
import { execute } from '../dev-cli/commands/_command-runner'

const hostOperation = Process.argv[2] === 'unsandboxed' && Process.argv[3] !== '--help'
await CLIKit.configureCLIOutput('agent', { delegate: hostOperation && Process.argv[3] !== 'git' })
if (hostOperation) {
  await unsandboxed.action(Process.argv.slice(3))
  await IO.finish()
} else {
  await execute('agent')
}
