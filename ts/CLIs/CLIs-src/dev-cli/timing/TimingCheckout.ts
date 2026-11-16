import { IO } from '@cli-kit'
import { S } from '@shared'
import { Path, Platform } from '@shared/os'
import { captureGit, resolveCommit } from '../../agent-skills/performance-investigation/Git'
import { copyRemote } from '../../agent-skills/performance-investigation/Remote'
import { createSnapshot, type PerformanceSnapshot } from '../../agent-skills/performance-investigation/Snapshot'
import { readTimingRemote, type TimingRemoteRequest } from './TimingRemote'
import { requireTimingWorkload, runTiming, type TimingSnapshotTransfer } from './TimingRun'
import { readTimingRunner } from './TimingRunnerConfiguration'

/** TimingCheckout selects local saved source and one round of preview measurements. */
export type TimingCheckout = { directory: string; ref?: string; samples: number; edits: number; dryRun?: boolean }

/** runCheckoutTiming measures an isolated copy of the selected source over ordinary SSH. */
export async function runCheckoutTiming(options: TimingCheckout): Promise<void> {
  requireTimingWorkload(options)
  const checkout = (await captureGit(options.directory, ['rev-parse', '--show-toplevel'])).trim()
  const ref = options.ref === undefined ? undefined : await resolveCommit(checkout, options.ref)
  const runner = await readTimingRunner()
  if (options.dryRun) {
    IO.print(S`
      Checkout: ${checkout}
      Source: ${ref ?? 'saved working files, including uncommitted changes'}
      Runner: ${runner.host} (${runner.tooling})
      Workload: ${options.samples} sessions × ${options.edits} edits
    `)
    return
  }
  const snapshot = await createSnapshot(checkout, ref)
  const directory = Path.posix.join(runner.tooling, '.artifacts/tmp', 'timing-checkout-' + Platform.randomUUID())
  const remote = { host: runner.host, directory: runner.tooling, controlPath: 'none' }
  IO.progress(`Timing ${snapshot.commit.slice(0, 12)} on ${runner.host}. Temporary checkout: ${directory}`)
  const transfer = await stageRunnerSnapshot(remote, directory, snapshot)
  await runTiming({
    host: runner.host,
    tooling: runner.tooling,
    repo: Path.posix.join(directory, 'checkout'),
    samples: options.samples,
    edits: options.edits,
    controlPath: remote.controlPath,
    snapshot: transfer,
  })
  await readTimingRemote({ ...remote, args: ['rm', '-rf', '--', directory] })
}

async function stageRunnerSnapshot(
  remote: Omit<TimingRemoteRequest, 'args'>,
  directory: string,
  snapshot: PerformanceSnapshot,
): Promise<TimingSnapshotTransfer> {
  const bundle = Path.posix.join(directory, 'snapshot.bundle')
  const manifest = Path.posix.join(directory, 'snapshot.json')
  await readTimingRemote({ ...remote, args: ['mkdir', '-p', '-m', '700', '--', directory] })
  await copyRemote(remote.host, snapshot.bundle, bundle, false, remote.controlPath)
  await copyRemote(
    remote.host,
    Path.join(Path.dirname(snapshot.bundle), 'snapshot.json'),
    manifest,
    false,
    remote.controlPath,
  )
  return { bundle, manifest, commit: snapshot.commit, tree: snapshot.tree }
}
