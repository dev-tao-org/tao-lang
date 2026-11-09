import { NewlineCharacter } from '../../../universal/Characters'
import { createRequire, resolve, spawnSync } from '../../bridges/Bridge_node/Bridge_node'
import * as Process from '../../Process/Process-Current'
import { installWorkspace } from './Install'

const SetupOperation = 'setup'
const HostCommandsPath = '.config/agent-host-commands.json'

/** installHostWorkspace validates setup permission and host access before installing dependencies. */
export async function installHostWorkspace(completionScript: string): Promise<void> {
  requireSetupHostAccess()
  await installWorkspace(completionScript)
}

function requireSetupHostAccess(): void {
  const commands = readSetupHostCommands()
  if (!commands.includes(SetupOperation)) {
    exitSetupFailure(`Host command '${SetupOperation}' is not allowlisted in ${HostCommandsPath}.`)
  }
  const result = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout?.trim()) {
    exitSetupFailure(
      'Host process access is unavailable. Run ./agent unsandboxed setup --frozen-lockfile in a host-enabled harness.',
    )
  }
}

function readSetupHostCommands(): string[] {
  // The bootstrap boundary uses Node's JSON module loader before shared Json dependencies exist.
  const loadModule = createRequire(import.meta.url)
  const commands: unknown = loadModule(resolve('..', HostCommandsPath))
  if (!Array.isArray(commands) || !commands.every(command => typeof command === 'string')) {
    exitSetupFailure(`The ${HostCommandsPath} file must contain a JSON array of command prefixes.`)
  }
  return commands
}

function exitSetupFailure(message: string): never {
  Process.stderr.write(message + NewlineCharacter)
  Process.exit(1)
}
