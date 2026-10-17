import { runCommand } from '@cli-kit'

// This dependency-free entrypoint runs before the command registry's dependencies are installed.
process.exitCode = await runCommand([process.execPath, 'install', ...Bun.argv.slice(2)])
