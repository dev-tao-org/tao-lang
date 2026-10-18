import type { RuntimeApplication } from '@runtime/Runtime'
import { Timings, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import type { Project } from './Project'

/** publishBuild stages compilation output, then atomically publishes only changed files.
 *  A superseded request may finish staging but cannot replace the current runtime application. */
export async function publishBuild(
  project: Project,
  code: string,
  prepareRuntime: () => Promise<RuntimeApplication>,
  isCurrent: () => boolean,
  timings: Timings,
): Promise<void> {
  const WriteBuild = timings.measure('workspace.build.write', writeBuild)
  const path = await WriteBuild(project.buildDirectory, code)
  if (!isCurrent()) {
    return
  }
  const PrepareRuntime = timings.measure('workspace.runtime.prepare', prepareRuntime)
  const runtime = await PrepareRuntime()
  const PublishChanged = timings.measure('workspace.runtime.publish-changed', publishChanged)
  await PublishChanged(path, runtime.appPath, isCurrent)
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
    finally() {
      return FileSystem.rm(pending, { force: true })
    },
  })
}
