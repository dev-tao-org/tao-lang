import './commands/check'
import './commands/my-branch'
import './commands/my-sync'
import './commands/setup'
import './commands/test'
import './commands/typecheck'
import { execute } from './commands/_command-runner'

if (import.meta.main) {
    await execute()
}
