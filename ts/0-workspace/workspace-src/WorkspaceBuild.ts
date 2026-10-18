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
  onProgress?: (message: string) => void,
): Promise<void> {
  onProgress?.('Writing generated app build…')
  const path = await writeBuild(timings, buildDirectory, code)
  onProgress?.('Generated app build write complete.')
  if (!isCurrent()) {
    return
  }
  onProgress?.('Preparing runtime resources and cached toolchain…')
  const runtime = await runPrepareRuntime(timings, prepareRuntime)
  onProgress?.('Runtime resources and toolchain ready.')
  onProgress?.('Publishing changed runtime app files…')
  await publishChanged(timings, path, runtime.appPath, isCurrent)
  onProgress?.('Runtime app file publication complete.')
}

const runPrepareRuntime = Timings.measure('workspace.runtime.prepare', function(
  prepareRuntime: () => Promise<RuntimeApplication>,
): Promise<RuntimeApplication> {
  return prepareRuntime()
})

const writeBuild = Timings.measure(
  'workspace.build.write',
  async function(directory: string, code: string): Promise<string> {
    await FileSystem.mkdir(directory, { recursive: true })
    const path = Path.join(directory, 'App.tsx')
    await FileSystem.writeIfChanged(path, code)
    return path
  },
)

const publishChanged = Timings.measure('workspace.runtime.publish-changed', async function(
  buildPath: string,
  target: string,
  isCurrent: () => boolean,
): Promise<void> {
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
})
