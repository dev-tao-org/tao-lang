import { Errors, Json, Time, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { createSampleName, JobFileName } from './JobFiles'
import type { MeasurementJob } from './Runner'

/** collectSamples persists each independent sample and records failure without discarding completed evidence. */
export async function collectSamples(
  directory: string,
  job: MeasurementJob,
  measure: () => Promise<string>,
): Promise<void> {
  await writeJob(directory, job)
  await Try(async () => {
    for (let index = 0; index < job.settings.samples; index++) {
      const source = await measure()
      const name = createSampleName(index)
      await FileSystem.copyFile(source, Path.join(directory, name))
      job.samples.push(name)
      await writeJob(directory, job)
    }
    job.status = 'passed'
  }, {
    catch(error) {
      job.status = 'failed'
      job.error = String(error)
      Errors.Throw(error)
    },
    async finally() {
      job.finishedAt = Time.date().toISOString()
      await writeJob(directory, job)
    },
  })
}

async function writeJob(directory: string, job: MeasurementJob): Promise<void> {
  const path = Path.join(directory, JobFileName)
  const pending = `${path}.pending`
  await FileSystem.writeFile(pending, Json.PrintIndented(job) + '\n')
  await FileSystem.rename(pending, path)
}
