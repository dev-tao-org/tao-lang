import '../cli-kit/fatal-errors'
import { IO } from '@cli-kit'
import { Env } from '@shared/os'
import '../dev-cli/dev-cli'
import { execute } from '../dev-cli/commands/_command-runner'

const terminal = Env.is('TERMINAL_OUTPUT', '1')
// Preserve the selected output mode in children when invoked without the shell wrapper.
Env.set('TERMINAL_OUTPUT', terminal ? '1' : '0')
IO.config({
  stdout: terminal ? 'terminal' : 'log',
  stderr: terminal ? 'terminal' : 'both',
  logDirectory: 'agent',
  logFile: Env.get('OUTPUT_LOG_FILE'),
})
await execute('agent')
