import { IO, resolveCallerPath, runNonInteractiveCommand } from '@cli-kit'
import { Errors, NullCharacter, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'

/** RemoteExecution selects a runner directory, optional detached log and existing SSH control socket. */
export type RemoteExecution = { directory: string; log?: string; controlPath?: string }

/** executeRemote reuses SSH configuration and authentication without introducing a separate agent identity. */
export async function executeRemote(
  host: string,
  args: readonly string[],
  options: RemoteExecution,
  execute = runNonInteractiveCommand,
): Promise<void> {
  requireHost(host)
  IO.progress(`Connecting to ${host} using existing SSH access…`)
  await execute('ssh -o BatchMode=yes -o ConnectTimeout=10', {
    variadicArgs: [
      ...options.controlPath ? ['-S', options.controlPath] : [],
      '--',
      host,
      createRemoteCommand(args, options.directory, options.log),
    ],
  })
}

/** copyRemote transfers a file through existing SSH access; remote paths use modern OpenSSH's SFTP transport. */
export async function copyRemote(host: string, source: string, destination: string, download: boolean): Promise<void> {
  requireHost(host)
  const remote = download ? source : destination
  requireAbsoluteRemotePath(remote)
  const local = resolveCallerPath(download ? destination : source)
  const paths = download ? [`${host}:${remote}`, local] : [local, `${host}:${remote}`]
  await runNonInteractiveCommand('scp -B', { variadicArgs: ['--', ...paths] })
}

/** discoverHosts lists known SSH aliases and Tailscale peers without connecting to candidates. */
export async function discoverHosts(): Promise<DiscoveredHosts> {
  const config = Path.join(Platform.homeDirectory(), '.ssh/config')
  const text = await Try.WithDefault('', () => FileSystem.readFile(config, 'utf8'))
  const aliases = [...text.matchAll(/^\s*Host\s+(.+)$/gmi)]
    .flatMap(match => match[1].split(/\s+/))
    .filter(alias => /^[a-z\d][a-z\d_.-]*$/i.test(alias))
  const tailscale = await Try(() => Platform.capture('tailscale status --json'), {
    catch: error => JSON.stringify({ Error: String(error) }),
  })
  return { sshAliases: [...new Set(aliases)], sshConfig: config, tailscale: JSON.parse(tailscale) as unknown }
}

/** requireHost rejects SSH options and shell expressions where a host is expected. */
export function requireHost(host: string): void {
  if (!/^(?:[a-z\d_][a-z\d_.-]*@)?[a-z\d][a-z\d_.:-]*$/i.test(host)) {
    Errors.ThrowUserInput('Use an SSH alias or user@hostname. Run the skill helper hosts to discover candidates.')
  }
}

type DiscoveredHosts = { sshAliases: string[]; sshConfig: string; tailscale: unknown }

function createRemoteCommand(args: readonly string[], directory: string, log?: string): string {
  requireAbsoluteRemotePath(directory)
  if (!args.length) {
    Errors.ThrowUserInput('Provide a remote executable and its arguments.')
  }
  const command = args.map(quoteShellArgument).join(' ')
  if (log) {
    requireAbsoluteRemotePath(log)
    return `cd ${quoteShellArgument(directory)} || exit\nnohup ${command} > ${
      quoteShellArgument(log)
    } 2>&1 < /dev/null &`
  }
  return `cd ${quoteShellArgument(directory)} && exec ${command}`
}

function requireAbsoluteRemotePath(path: string): void {
  if (!path.startsWith('/') || /[\0\r\n]/.test(path)) {
    Errors.ThrowUserInput('Use an absolute POSIX path on the runner, without control characters or ~ expansion.')
  }
}

function quoteShellArgument(value: string): string {
  if (value.includes(NullCharacter)) {
    Errors.ThrowUserInput('Remote arguments cannot contain a null character.')
  }
  return "'" + value.replaceAll("'", "'\\''") + "'"
}
