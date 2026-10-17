import { Platform } from '@shared/os'
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
  await execute()
}
