import type * as Runtime from '@runtime'
import type * as Expo from '@runtime/expo'
import { Json } from '@shared'

import { Errors, NewlineCharacter, Objects, Timings, Try } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import { publishDirectory } from '../PublishDirectory'

/** publishBuild publishes one complete generated-file revision and maintains its disk inspection mirror.
 *  Memory publication remains the only Metro path; disk snapshots are switched atomically after acceptance. */
export async function publishBuild(
  buildDirectory: string,
  files: Expo.GeneratedRevision['files'],
  revision: string,
  prepareRuntime: () => Promise<Runtime.RuntimeApplication>,
  isCurrent: () => boolean,
  timings: Timings,
  onProgress?: (message: string) => void,
): Promise<Expo.PublicationOutcome | undefined> {
  if (!isCurrent()) {
    return
  }
  if (files['App.tsx'] === undefined) {
    Errors.ThrowUserInput('Generated app build must contain App.tsx.')
  }
  onProgress?.('Preparing runtime resources and cached toolchain…')
  const runtime = await timings.run(prepareApplication, prepareRuntime)
  onProgress?.('Runtime resources and toolchain ready.')
  if (!isCurrent()) {
    return
  }
  const generated = {
    revision,
    sequence: Math.max(runtime.publicationSequence ?? 0, runtime.generated?.sequence ?? 0) + 1,
    files: Objects.copy(files),
  }
  runtime.publicationSequence = generated.sequence
  if (runtime.publishGenerated) {
    return await timings.run(publishMemoryBuild, buildDirectory, runtime, generated, timings)
  }
  onProgress?.('Writing generated app build…')
  const snapshot = await timings.run(
    writeBuild,
    buildDirectory,
    runtime,
    generated.files,
    isCurrent,
  )
  if (!snapshot || !isCurrent()) {
    return
  }
  onProgress?.('Publishing changed runtime app files…')
  await timings.run(publishChanged, snapshot, runtime, generated.files, runtime.generated?.files, isCurrent)
  if (isCurrent()) {
    await timings.run(publishSnapshot, buildDirectory, snapshot)
    mirrors.set(runtime, Path.resolve(buildDirectory))
    runtime.generated = generated
  }
  onProgress?.('Runtime app file publication complete.')
}

const mirrors = new WeakMap<Runtime.RuntimeApplication, string>()
type PreviousGeneratedFiles = Expo.GeneratedRevision['files'] | undefined

const publishMemoryBuild = Timings.measured('workspace.runtime.publish-memory', async function(
  buildDirectory: string,
  runtime: Runtime.RuntimeApplication,
  generated: Expo.GeneratedRevision,
  timings: Timings,
): Promise<Expo.PublicationOutcome> {
  const publish = runtime.publishGenerated
  if (publish === undefined) {
    Errors.ThrowShouldNeverHappen('The preview publisher disappeared during publication.')
  }
  const outcome = await publish(generated)
  const committed = outcome.status === 'published' || outcome.publishedRevision === generated.revision
  if (committed && generated.sequence > (runtime.generated?.sequence ?? -1)) {
    runtime.generated = generated
  }
  const isAcceptedRevisionCurrent = () => runtime.generated === generated
  if (isAcceptedRevisionCurrent() && shouldMaintainMirror(runtime, buildDirectory)) {
    const snapshot = await timings.run(
      writeBuild,
      buildDirectory,
      runtime,
      generated.files,
      isAcceptedRevisionCurrent,
    )
    if (snapshot && isAcceptedRevisionCurrent()) {
      await timings.run(publishSnapshot, buildDirectory, snapshot)
      mirrors.set(runtime, Path.resolve(buildDirectory))
    }
  }
  if (outcome.status === 'error' || outcome.status === 'poisoned') {
    const message = outcome.message
    if (message === undefined) {
      Errors.ThrowUserInput(`Preview publication failed: ${outcome.status}`)
    }
    Errors.ThrowUserInput(message)
  }
  return outcome
})

const prepareApplication = Timings.measured(
  'workspace.runtime.prepare',
  (prepare: () => Promise<Runtime.RuntimeApplication>) => prepare(),
)

function shouldMaintainMirror(
  runtime: Runtime.RuntimeApplication,
  directory: string,
): boolean {
  return mirrors.get(runtime) === Path.resolve(directory) || FS.existsSync(directory)
}

const writeBuild = Timings.measured(
  'workspace.build.write',
  async function(
    directory: string,
    runtime: Runtime.RuntimeApplication,
    files: Expo.GeneratedRevision['files'],
    isCurrent: () => boolean,
  ): Promise<string | undefined> {
    const revisions = `${directory}.revisions`
    const revisionDirectory = Path.join(revisions, Platform.randomUUID())
    await FS.mkdir(revisionDirectory)
    await Try(async () => {
      await copyBuildConfiguration(revisionDirectory, runtime)
      await writeSnapshotFiles(revisionDirectory, files)
      if (isCurrent()) {
        return revisionDirectory
      }
      await FS.rm(revisionDirectory, { recursive: true, force: true })
    }, {
      async catch(error) {
        await FS.rm(revisionDirectory, { recursive: true, force: true })
        Errors.Throw(error)
      },
    })
    return isCurrent() ? revisionDirectory : undefined
  },
)

async function copyBuildConfiguration(nextDirectory: string, runtime: Runtime.RuntimeApplication): Promise<void> {
  const configuration = serializePublishedBuildConfiguration(Path.join(runtime.directory, 'tsconfig.json'))
  await FS.writeIfChanged(Path.join(nextDirectory, 'tsconfig.json'), configuration)
  const targetLink = Path.join(nextDirectory, 'node_modules')
  const dependencyTarget = Path.join(runtime.directory, 'node_modules')
  await FS.symlink(dependencyTarget, targetLink, 'dir')
}

function serializePublishedBuildConfiguration(extendsPath: string): string {
  return `${Json.Print({ extends: extendsPath, include: ['./**/*.ts', './**/*.tsx'] })}${NewlineCharacter}`
}

async function writeSnapshotFiles(
  nextDirectory: string,
  files: Expo.GeneratedRevision['files'],
): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    const path = resolveGeneratedPath(nextDirectory, file)
    await FS.mkdir(Path.dirname(path))
    await FS.writeFile(path, content)
  }
}

function resolveGeneratedPath(directory: string, file: string): string {
  const root = Path.resolve(directory)
  const path = Path.resolve(root, file)
  if (path !== root && !Path.isWithin(root, path)) {
    Errors.ThrowUserInput(`Generated file path escapes the build directory: ${file}`)
  }
  return path
}

const publishSnapshot = Timings.measured('workspace.build.publish-snapshot', async function(
  directory: string,
  revisionDirectory: string,
): Promise<void> {
  await publishDirectory(revisionDirectory, directory)
})

const publishChanged = Timings.measured('workspace.runtime.publish-changed', async function(
  snapshot: string,
  runtime: Runtime.RuntimeApplication,
  files: Expo.GeneratedRevision['files'],
  previousFiles: PreviousGeneratedFiles,
  isCurrent: () => boolean,
): Promise<void> {
  if (!isCurrent()) {
    return
  }
  await writeAtomicGeneratedFiles(Path.join(runtime.directory, 'src'), files, isCurrent)
  for (const file of Object.keys(previousFiles ?? {})) {
    if (!hasGeneratedSourceFile(files, file)) {
      await FS.rm(resolveGeneratedPath(Path.join(runtime.directory, 'src'), file), { force: true })
    }
  }
  const mirrored = await FS.readFile(Path.join(snapshot, 'App.tsx'), 'utf8')
  if (mirrored !== files['App.tsx']) {
    Errors.ThrowUserInput('Generated app build changed while publishing.')
  }
})

function hasGeneratedSourceFile(files: Expo.GeneratedRevision['files'], file: string): boolean {
  return file in files
}

async function writeAtomicGeneratedFiles(
  directory: string,
  files: Expo.GeneratedRevision['files'],
  isCurrent: () => boolean,
): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    if (!isCurrent()) {
      return
    }
    const path = resolveGeneratedPath(directory, file)
    await FS.mkdir(Path.dirname(path))
    const previous = await Try.WithDefault(undefined, () => FS.readFile(path, 'utf8'))
    if (previous !== content) {
      await writeAtomic(path, content, isCurrent)
    }
  }
}

async function writeAtomic(path: string, content: string, isCurrent: () => boolean): Promise<void> {
  const pending = `${path}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FS.writeFile(pending, content)
    if (isCurrent()) {
      await FS.rename(pending, path)
    }
  }, {
    finally: () => FS.rm(pending, { force: true }),
  })
}
