import '../cli-kit/fatal-errors'
import { IO } from '@cli-kit'
import { Env } from '@shared/os'
import '../dev-cli/dev-cli'
import { execute } from '../dev-cli/commands/_command-runner'

const agent = !Env.is('TAO_AGENT', '0')
// Preserve agent mode in children when this entrypoint is invoked without the shell wrapper.
Env.set('TAO_AGENT', agent ? '1' : '0')
IO.config({
  stdout: agent ? 'log' : 'terminal',
  stderr: agent ? 'both' : 'terminal',
  logDirectory: agent ? 'agent' : 'dev',
  logFile: Env.get('TAO_AGENT_LOG'),
})
await execute('agent')
