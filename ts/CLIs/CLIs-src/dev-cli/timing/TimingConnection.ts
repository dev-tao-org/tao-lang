import * as CLIKit from '@cli-kit'
import { IO } from '@cli-kit'
import { Errors, Json, UserInput } from '@shared'
import { DevelopmentStorage, FS, Path, Platform, Terminal } from '@shared/os'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'

/** TimingConnection selects an existing SSH endpoint and optional connection preview. */
export type TimingConnection = { host: string; dryRun?: boolean; controlPath?: string }

// TimingConnectionIO holds native SSH operations for one connection invocation.
type TimingConnectionIO = {
  interactive: boolean
  execute: typeof CLIKit.runNonInteractiveCommand
  executeInteractive: typeof CLIKit.runInteractiveCommand
  exists: typeof FS.exists
  mkdir: (directory: string) => Promise<void>
  print: (message: string) => void
  resolveSocket: (host: string) => string
}

/** connectTiming authenticates one reusable SSH session without changing keys, trust policy or SSH configuration. */
export async function connectTiming(options: TimingConnection): Promise<void> {
  const io = createConnectionIO()
  requireHost(options.host)
  const socket = options.controlPath ?? io.resolveSocket(options.host)
  if (options.dryRun) {
    io.print(`Would authenticate SSH to ${options.host}, retain its connection for two idle hours, then return here.`)
    return
  }
  if (await io.exists(socket)) {
    await io.execute('ssh', ['-O', 'check', '-S', socket, '--', options.host])
    io.print(`Existing SSH connection is ready for ${options.host}.`)
    return
  }
  UserInput.Require(
    !!io.interactive,
    'Run ./dev timing-connect HOST in Terminal to verify the host and enter your SSH password.',
  )
  await io.mkdir(Path.dirname(socket))
  io.print('SSH may ask for the timing Mac’s login password. Input is hidden; Ctrl+C cancels.')
  await io.executeInteractive('ssh', [
    '-fN',
    '-o',
    'ControlMaster=auto',
    '-o',
    'ControlPersist=2h',
    '-o',
    'ConnectTimeout=10',
    '-S',
    socket,
    '--',
    options.host,
  ])
  await io.execute('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-S', socket, '--', options.host, 'true'])
  io.print(`SSH ready for ${options.host}. You are still on this Mac; no remote shell was opened.`)
}

/** disconnectTiming closes the selected Tao SSH master without opening a remote shell. */
export async function disconnectTiming(options: TimingConnection): Promise<void> {
  const io = createConnectionIO()
  requireHost(options.host)
  const socket = options.controlPath ?? io.resolveSocket(options.host)
  if (options.dryRun) {
    io.print(`Would close the Tao SSH connection to ${options.host}.`)
    return
  }
  if (!await io.exists(socket)) {
    io.print(`No saved SSH connection to ${options.host} is open.`)
    return
  }
  await io.execute('ssh', ['-O', 'exit', '-S', socket, '--', options.host])
  io.print(`SSH connection to ${options.host} closed.`)
}

/** resolveTimingSocket isolates reusable connections by the exact selected host. */
export function resolveTimingSocket(host: string, sessionId?: string): string {
  const identity = sessionId ? Json.Print({ host, sessionId }, { prettyPrint: false }) : host
  const name = 's-' + Platform.hashText(identity).slice(0, 16)
  const socket = DevelopmentStorage.resolveDirectory('ssh', name)
  if (socket.length > 100) {
    Errors.ThrowHostEnvironment('The developer SSH directory is too long for a macOS SSH control socket.')
  }
  return socket
}

function createConnectionIO(): TimingConnectionIO {
  return {
    interactive: Terminal.isInteractive(),
    execute: CLIKit.runNonInteractiveCommand,
    executeInteractive: CLIKit.runInteractiveCommand,
    exists: FS.exists,
    async mkdir(directory) {
      await FS.mkdirPrivate(directory)
    },
    print: IO.print,
    resolveSocket: resolveTimingSocket,
  }
}
