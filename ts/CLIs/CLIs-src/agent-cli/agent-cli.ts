import '../cli-kit/fatal-errors'
import { configureCLIOutput, IO } from '@cli-kit'
import { Platform } from '@shared/os'
import './commands/skill-script'
import unsandboxed from './commands/unsandboxed'
import '../dev-cli/dev-cli'
import { execute } from '../dev-cli/commands/_command-runner'

const hostOperation = Platform.argv[2] === 'unsandboxed' && Platform.argv[3] !== '--help'
await configureCLIOutput('agent', { delegate: hostOperation && Platform.argv[3] !== 'git' })
if (hostOperation) {
  await unsandboxed.action(Platform.argv.slice(3))
  await IO.finish()
} else {
  await execute('agent')
}
