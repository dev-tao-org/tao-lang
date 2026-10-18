import '../cli-kit/fatal-errors'
import { configureCLIOutput, IO } from '@cli-kit'
import { Try } from '@shared'
import { Platform } from '@shared/os'
import unsandboxed from './commands/unsandboxed'
import '../dev-cli/dev-cli'
import { execute } from '../dev-cli/commands/_command-runner'

const hostOperation = Platform.argv[2] === 'unsandboxed' && Platform.argv[3] !== '--help'
await configureCLIOutput('agent', { delegate: hostOperation })
if (hostOperation) {
  await Try(() => unsandboxed.action(Platform.argv.slice(3)), {
    finally: (_thrown, error) => IO.finish(error ? 'failed' : 'passed'),
  })
} else {
  await execute('agent')
}
