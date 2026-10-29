import { IO, resolveCallerPath } from '@cli-kit'
import { Platform, Repo } from '@shared/os'
import { Command } from 'commander'
import { receiveSnapshot } from './Checkout'
import { copyRemote, discoverHosts, executeRemote } from './Remote'
import { runMeasurements } from './Runner'
import { createSnapshot } from './Snapshot'
import { summarizeJob } from './Summary'

/** main exposes deterministic helpers while the skill owns investigation and causal interpretation. */
export async function main(): Promise<void> {
  const command = new Command().name('performance-skill')
    .description(
      'Snapshot, transfer and measure source using existing SSH access; no daemon or separate authentication.',
    )
  registerSnapshotCommands(command)
  registerRemoteCommands(command)
  registerMeasurementCommands(command)
  await command.parseAsync(Platform.argv)
}

type ReceiveOptions = { bundle: string; manifest: string; directory: string; ref?: string }
type RunOptions = { repo: string; fixture: string; samples: string; edits: string }

function registerSnapshotCommands(command: Command): void {
  command.command('snapshot').description('Export saved source and history without changing the real index.')
    .option('--repo <path>', 'Controller checkout.', Repo.getWorkspaceRoot())
    .option('--ref <revision>', 'Export this committed checkpoint instead of saved working source.')
    .action(async (options: { repo: string; ref?: string }) => {
      printResult(await createSnapshot(resolveCallerPath(options.repo), options.ref))
    })
  command.command('receive').description('Verify a transferred bundle and clone a checkpoint into a new directory.')
    .requiredOption('--bundle <path>', 'Transferred snapshot.bundle.')
    .requiredOption('--manifest <path>', 'Transferred snapshot.json.')
    .requiredOption('--directory <path>', 'New owned clone directory.')
    .option('--ref <sha>', 'Full checkpoint SHA; defaults to the captured snapshot.')
    .action(async (options: ReceiveOptions) => {
      await receiveSnapshot(
        resolveCallerPath(options.bundle),
        resolveCallerPath(options.manifest),
        resolveCallerPath(options.directory),
        options.ref,
      )
    })
}

function registerRemoteCommands(command: Command): void {
  command.command('hosts').description('List SSH aliases and Tailscale peers; never choose or connect to a host.')
    .action(async () => printResult(await discoverHosts()))
  command.command('ssh').description('Run argv on a chosen POSIX host through existing SSH configuration.')
    .argument('<host>', 'Existing SSH alias or user@hostname.')
    .argument('<args...>', 'Remote executable and literal arguments, after --.')
    .requiredOption('--cwd <path>', 'Absolute directory on the runner.')
    .option('--detach <log>', 'Start a disconnect-resistant job with output at this absolute runner path.')
    .action(async (host: string, args: string[], options: { cwd: string; detach?: string }) => {
      await executeRemote(host, args, options.cwd, options.detach)
    })
  command.command('copy').description('Transfer a file using existing OpenSSH/SFTP access.')
    .argument('<host>').argument('<source>').argument('<destination>')
    .option('--download', 'Copy runner source to controller destination.')
    .action(async (host: string, source: string, destination: string, options: { download?: boolean }) => {
      await copyRemote(host, source, destination, options.download ?? false)
    })
}

function registerMeasurementCommands(command: Command): void {
  command.command('run').description('Measure a prepared immutable clone under the shared timing lock.')
    .requiredOption('--repo <path>', 'Candidate checkout; source must be clean.')
    .requiredOption('--fixture <path>', 'Canonical fixture held constant across checkpoints.')
    .option('--samples <count>', 'Independent preview process sessions.', '1')
    .option('--edits <count>', 'Edits per session; warm samples exclude the first four.', '24')
    .action(async (options: RunOptions) => {
      const directory = await runMeasurements({
        repo: resolveCallerPath(options.repo),
        fixture: resolveCallerPath(options.fixture),
        samples: Number(options.samples),
        edits: Number(options.edits),
      })
      printResult({ directory })
    })
  command.command('summarize').description('Summarize independent run medians and retain raw job evidence.')
    .argument('<directories...>', 'Completed job directories.')
    .action(async (directories: string[]) => {
      printResult(await Promise.all(directories.map(directory => summarizeJob(resolveCallerPath(directory)))))
    })
}

function printResult(value: unknown): void {
  IO.print(JSON.stringify(value, null, 2))
}
