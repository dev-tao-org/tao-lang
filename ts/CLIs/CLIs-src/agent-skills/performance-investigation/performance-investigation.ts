import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Json } from '@shared'
import { Repo } from '@shared/os'
import { Process } from '@shared/os'
import { Command } from '../../cli-kit/bridges/Bridge_commander'
import { type BranchComparisonOptions, runBranchComparison } from './BranchComparison'
import { receiveSnapshot } from './Checkout'
import { copyRemote, discoverHosts, executeRemote, type RemoteExecution } from './Remote'
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
  registerComparisonCommand(command)
  await command.parseAsync(Process.argv)
}

function registerComparisonCommand(command: Command): void {
  command.command('compare').description('Compare two prepared checkouts in paired preview sessions.')
    .argument('<baseline>', 'Absolute baseline checkout.')
    .argument('<candidate>', 'Absolute candidate checkout.')
    .option('--pairs <count>', 'Independent baseline/candidate pairs per round.', '5')
    .action(async (baseline: string, candidate: string, options: { pairs: string }) => {
      const comparison: BranchComparisonOptions = {
        baseline: CLIKit.resolveCallerPath(baseline),
        candidate: CLIKit.resolveCallerPath(candidate),
        pairs: Number(options.pairs),
      }
      await runBranchComparison(comparison)
    })
}

type ReceiveOptions = { bundle: string; manifest: string; directory: string; ref?: string }
type RunOptions = { repo: string; fixture: string; samples: string; edits: string }
type RemoteCommandOptions = { cwd: string; detach?: string; controlPath?: string }
type CopyOptions = { download?: boolean; controlPath?: string }

function registerSnapshotCommands(command: Command): void {
  command.command('snapshot').description('Export saved source and history without changing the real index.')
    .option('--repo <path>', 'Controller checkout.', Repo.getWorkspaceRoot())
    .option('--ref <revision>', 'Export this committed checkpoint instead of saved working source.')
    .action(async (options: { repo: string; ref?: string }) => {
      printResult(await createSnapshot(CLIKit.resolveCallerPath(options.repo), options.ref))
    })
  command.command('receive').description('Verify a transferred bundle and clone a checkpoint into a new directory.')
    .requiredOption('--bundle <path>', 'Transferred snapshot.bundle.')
    .requiredOption('--manifest <path>', 'Transferred snapshot.json.')
    .requiredOption('--directory <path>', 'New owned clone directory.')
    .option('--ref <sha>', 'Full checkpoint SHA; defaults to the captured snapshot.')
    .action(async (options: ReceiveOptions) => {
      await receiveSnapshot(
        CLIKit.resolveCallerPath(options.bundle),
        CLIKit.resolveCallerPath(options.manifest),
        CLIKit.resolveCallerPath(options.directory),
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
    .option('--control-path <path>', 'Reuse an existing SSH control socket.')
    .action(async (host: string, args: string[], options: RemoteCommandOptions) => {
      const request = describeRemoteExecution(options)
      await executeRemote(host, args, request)
    })
  command.command('copy').description('Transfer a file using existing OpenSSH/SFTP access.')
    .argument('<host>').argument('<source>').argument('<destination>')
    .option('--download', 'Copy runner source to controller destination.')
    .option('--control-path <path>', 'Reuse an existing SSH control socket.')
    .action(async (host: string, source: string, destination: string, options: CopyOptions) => {
      await copyRemote(host, source, destination, options.download ?? false, options.controlPath)
    })
}

function describeRemoteExecution(options: RemoteCommandOptions): RemoteExecution {
  return { directory: options.cwd, log: options.detach, controlPath: options.controlPath }
}

function registerMeasurementCommands(command: Command): void {
  command.command('run').description('Measure a prepared immutable clone under the shared timing lock.')
    .requiredOption('--repo <path>', 'Candidate checkout; source must be clean.')
    .requiredOption('--fixture <path>', 'Canonical fixture held constant across checkpoints.')
    .option('--samples <count>', 'Independent preview process sessions.', '1')
    .option('--edits <count>', 'Edits per session; warm samples exclude the first complete cycle.', '24')
    .action(async (options: RunOptions) => {
      const directory = await runMeasurements({
        repo: CLIKit.resolveCallerPath(options.repo),
        fixture: CLIKit.resolveCallerPath(options.fixture),
        samples: Number(options.samples),
        edits: Number(options.edits),
      })
      printResult({ directory })
    })
  command.command('summarize').description('Summarize independent run medians and retain raw job evidence.')
    .argument('<directories...>', 'Completed job directories.')
    .action(async (directories: string[]) => {
      printResult(await Promise.all(directories.map(directory => summarizeJob(CLIKit.resolveCallerPath(directory)))))
    })
}

function printResult(value: unknown): void {
  IO.print(Json.Print(value))
}
