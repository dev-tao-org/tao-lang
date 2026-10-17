import { IO } from '@cli-kit'
import { Env, Platform } from '@shared/os'
import setup from './setup'

const terminal = !Env.is('TERMINAL_OUTPUT', '0')
IO.config({
  stdout: terminal ? 'terminal' : 'log',
  stderr: terminal ? 'terminal' : 'both',
  progress: terminal ? 'terminal' : 'log',
  logDirectory: 'dev',
  logFile: Env.get('OUTPUT_LOG_FILE'),
})
// Registration does not load Commander; setup can install dependencies before normal CLI parsing.
await setup.action(Platform.argv.slice(2))
