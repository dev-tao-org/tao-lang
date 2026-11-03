import { Process } from '@shared/os'
import '../cli-kit/fatal-errors'
import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'

import './commands/push'
import './commands/skill-script'
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
