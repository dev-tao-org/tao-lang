import { IO } from '@cli-kit'
import { Env, Platform } from '@shared/os'
import '../cli-kit/fatal-errors'
import './commands/agent-config'
import './commands/check'
import './commands/clean'
import './commands/doctor'
import './commands/fix'
import './commands/fmt'
import './commands/my-branch'
import './commands/my-sync'
import './commands/setup'
import './commands/setup-github'
import './commands/secrets'
import './commands/start'
import './commands/stop'
import './commands/test'
import './commands/verify'
import { execute } from './commands/_command-runner'

if (Platform.isMain(import.meta)) {
  const agent = Env.is('TAO_AGENT', '1')
  IO.config({
    stdout: agent ? 'log' : 'terminal',
    stderr: agent ? 'both' : 'terminal',
    logDirectory: agent ? 'agent' : 'dev',
    logFile: Env.get('TAO_AGENT_LOG'),
  })
  await execute()
}
