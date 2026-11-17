import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Errors, NullCharacter, Regxs, S, Try } from '@shared'
import { FS, Path } from '@shared/os'

/** RemoteExecution selects a runner directory, optional detached log and existing SSH control socket. */
export type RemoteExecution = { directory: string; log?: string; controlPath?: string; terminal?: boolean }

/** executeRemote reuses SSH configuration and authentication without introducing a separate agent identity. */
export async function executeRemote(
  host: string,
  args: readonly string[],
  options: RemoteExecution,
  execute = CLIKit.runNonInteractiveCommand,
): Promise<void> {
  requireHost(host)
  IO.progress(`Connecting to ${host} using existing SSH access…`)
  await execute('ssh', [
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=10',
    ...options.terminal ? ['-tt'] : [],
    ...options.controlPath ? ['-S', options.controlPath] : [],
    '--',
    host,
    createRemoteCommand(args, options.directory, options.log),
  ])
}

/** copyRemote transfers a file through existing SSH access; remote paths use modern OpenSSH's SFTP transport. */
export async function copyRemote(
  host: string,
  source: string,
  destination: string,
  download: boolean,
  controlPath?: string,
): Promise<void> {
  requireHost(host)
  const remote = download ? source : destination
  requireAbsoluteRemotePath(remote)
  const local = CLIKit.resolveCallerPath(download ? destination : source)
  const paths = download ? [`${host}:${remote}`, local] : [local, `${host}:${remote}`]
  const connection = controlPath ? ['-o', `ControlPath=${controlPath}`] : []
  await CLIKit.runNonInteractiveCommand('scp', ['-B', ...connection, '--', ...paths])
}

type DiscoveredHosts = { sshAliases: string[]; sshConfig: string }
/** discoverHosts lists configured SSH aliases without connecting to candidates. */
export async function discoverHosts(): Promise<DiscoveredHosts> {
  const config = Path.home('.ssh/config')
  const text = await Try.WithDefault('', () => FS.readFile(config, 'utf8'))
  const aliases = [...text.matchAll(Regxs.SshConfigHostLineRegx)]
    .flatMap(match => match[1].split(Regxs.SshConfigAliasesWhitespaceRegx))
    .filter(alias => Regxs.SshAliasRegx.test(alias))
  return { sshAliases: [...new Set(aliases)], sshConfig: config }
}

/** requireHost rejects SSH options and shell expressions where a host is expected. */
export function requireHost(host: string): void {
  if (!Regxs.SshHostRegx.test(host)) {
    Errors.ThrowUserInput('Use an SSH alias or user@hostname. Run the skill helper hosts to discover candidates.')
  }
}

function createRemoteCommand(args: readonly string[], directory: string, log?: string): string {
  requireAbsoluteRemotePath(directory)
  if (!args.length) {
    Errors.ThrowUserInput('Provide a remote executable and its arguments.')
  }
  const command = args.map(quoteShellArgument).join(' ')
  if (log) {
    requireAbsoluteRemotePath(log)
    const quotedLog = quoteShellArgument(log)
    return S`
      cd ${quoteShellArgument(directory)} || exit
      nohup ${command} > ${quotedLog} 2>&1 < /dev/null &
    `
  }
  return `cd ${quoteShellArgument(directory)} && exec ${command}`
}

function requireAbsoluteRemotePath(path: string): void {
  if (!path.startsWith('/') || Regxs.RemotePathControlCharacterRegx.test(path)) {
    Errors.ThrowUserInput('Use an absolute POSIX path on the runner, without control characters or ~ expansion.')
  }
}

function quoteShellArgument(value: string): string {
  if (value.includes(NullCharacter)) {
    Errors.ThrowUserInput('Remote arguments cannot contain a null character.')
  }
  return "'" + value.replaceAll("'", "'\\''") + "'"
}
