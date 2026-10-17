import '../../cli-kit/fatal-errors'
import setupCommand from './setup'

// This dependency-free entrypoint runs before the command registry's dependencies are installed.
await setupCommand.action(Bun.argv.slice(2))
