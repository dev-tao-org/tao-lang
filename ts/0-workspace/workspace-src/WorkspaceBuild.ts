import type { RuntimeApplication } from '@runtime/Runtime'
import { Timings, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'

/** publishBuild stages compilation output, then atomically publishes only changed files.
 *  A superseded request may finish staging but cannot replace the current runtime application. */
export async function publishBuild(
  buildDirectory: string,
  code: string,
  prepareRuntime: () => Promise<RuntimeApplication>,
  isCurrent: () => boolean,
  timings: Timings,
): Promise<void> {
  const path = await WriteBuild(timings, buildDirectory, code)
  if (!isCurrent()) {
    return
  }
  const runtime = await PrepareRuntime(timings, prepareRuntime)
  await PublishChanged(timings, path, runtime.appPath, isCurrent)
}

const WriteBuild = Timings.measure('workspace.build.write', writeBuild)
const PrepareRuntime = Timings.measure('workspace.runtime.prepare', runPrepareRuntime)
const PublishChanged = Timings.measure('workspace.runtime.publish-changed', publishChanged)

function runPrepareRuntime(prepareRuntime: () => Promise<RuntimeApplication>): Promise<RuntimeApplication> {
  return prepareRuntime()
}

async function writeBuild(directory: string, code: string): Promise<string> {
  await FileSystem.mkdir(directory, { recursive: true })
  const path = Path.join(directory, 'App.tsx')
  await FileSystem.writeIfChanged(path, code)
  return path
}

async function publishChanged(buildPath: string, target: string, isCurrent: () => boolean): Promise<void> {
  const [code, previous] = await Promise.all([
    FileSystem.readFile(buildPath, 'utf8'),
    Try.WithDefault(undefined, () => FileSystem.readFile(target, 'utf8')),
  ])
  if (!isCurrent() || code === previous) {
    return
  }
  const pending = `${target}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FileSystem.writeFile(pending, code)
    if (isCurrent()) {
      FileSystem.renameSync(pending, target)
    }
  }, {
    finally: () => FileSystem.rm(pending, { force: true }),
  })
}
