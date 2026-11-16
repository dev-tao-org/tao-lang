import * as CLIKit from '@cli-kit'
import { receiveSnapshot } from './Checkout'
import { allocateTimingJob, runMeasurementJob, type RunnerOptions, withTimingLock } from './Runner'

/** SnapshotMeasurement selects a transferred snapshot and its isolated measurement workload. */
export type SnapshotMeasurement = RunnerOptions & { bundle: string; manifest: string }

/** runSnapshotMeasurement holds the timing lock through preparation and measurement of a transferred checkout. */
export async function runSnapshotMeasurement(options: SnapshotMeasurement): Promise<string> {
  return await withTimingLock(async () => {
    const { bundle, manifest, ...workload } = options
    await receiveSnapshot(bundle, manifest, workload.repo)
    await CLIKit.runNonInteractiveCommand('./agent', ['unsandboxed', 'setup'], {
      cwd: workload.repo,
      addEnv: { TAO_SETUP_STORAGE: 'false' },
    })
    const directory = allocateTimingJob()
    await runMeasurementJob(workload, directory)
    return directory
  })
}
