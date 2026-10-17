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
import './commands/setup'
import './commands/setup-github'
import './commands/secrets'
import './commands/start'
import './commands/stop'
import './commands/test'
import './commands/verify'
import { execute } from './commands/_command-runner'

if (Platform.isMain(import.meta)) {
  const outputPreference = Env.get('TERMINAL_OUTPUT')
  const testRun = Platform.argv[2] === 'test' || Platform.argv[2] === 'verify'
  const terminal = outputPreference === undefined ? !testRun : outputPreference === '1'
  IO.config({
    stdout: terminal ? 'terminal' : 'log',
    stderr: terminal ? 'terminal' : 'both',
    logDirectory: 'dev',
    logFile: Env.get('OUTPUT_LOG_FILE'),
  })
  await execute()
}
