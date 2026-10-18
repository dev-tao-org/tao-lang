import { configureCLIOutput, IO } from '@cli-kit'
import { Platform } from '@shared/os'
import setup from './setup'

const agent = Platform.argv[2] === '--agent'
await configureCLIOutput(agent ? 'agent' : 'dev', { interactive: false })
// Registration does not load Commander; setup can install dependencies before normal CLI parsing.
await setup.action(Platform.argv.slice(agent ? 3 : 2))
await IO.finish()
