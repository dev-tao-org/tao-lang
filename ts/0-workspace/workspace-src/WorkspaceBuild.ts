import type { GeneratedRevision, PublicationOutcome } from '@runtime/expo/PreviewProtocol'
import type { RuntimeApplication } from '@runtime/Runtime'
import { Errors, Timings, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'

/** publishBuild publishes one complete generated-file revision and maintains its disk inspection mirror.
 *  Memory publication remains the only Metro path; disk snapshots are switched atomically after acceptance. */
export async function publishBuild(
  buildDirectory: string,
  files: GeneratedRevision['files'],
  revision: string,
  prepareRuntime: () => Promise<RuntimeApplication>,
  isCurrent: () => boolean,
  timings: Timings,
  onProgress?: (message: string) => void,
): Promise<PublicationOutcome | undefined> {
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
    files: { ...files },
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

const mirrors = new WeakMap<RuntimeApplication, string>()
type PreviousGeneratedFiles = GeneratedRevision['files'] | undefined

const publishMemoryBuild = Timings.measured('workspace.runtime.publish-memory', async function(
  buildDirectory: string,
  runtime: RuntimeApplication,
  generated: GeneratedRevision,
  timings: Timings,
): Promise<PublicationOutcome> {
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
  (prepare: () => Promise<RuntimeApplication>) => prepare(),
)

function shouldMaintainMirror(
  runtime: RuntimeApplication,
  directory: string,
): boolean {
  return mirrors.get(runtime) === Path.resolve(directory) || FileSystem.existsSync(directory)
}

const writeBuild = Timings.measured(
  'workspace.build.write',
  async function(
    directory: string,
    runtime: RuntimeApplication,
    files: GeneratedRevision['files'],
    isCurrent: () => boolean,
  ): Promise<string | undefined> {
    const revisions = `${directory}.revisions`
    const revisionDirectory = Path.join(revisions, Platform.randomUUID())
    await FileSystem.mkdir(revisionDirectory)
    await Try(async () => {
      await copyBuildConfiguration(revisionDirectory, runtime)
      await writeSnapshotFiles(revisionDirectory, files)
      if (isCurrent()) {
        return revisionDirectory
      }
      await FileSystem.rm(revisionDirectory, { recursive: true, force: true })
    }, {
      async catch(error) {
        await FileSystem.rm(revisionDirectory, { recursive: true, force: true })
        Errors.Throw(error)
      },
    })
    return isCurrent() ? revisionDirectory : undefined
  },
)

async function copyBuildConfiguration(nextDirectory: string, runtime: RuntimeApplication): Promise<void> {
  const configuration = serializePublishedBuildConfiguration(Path.join(runtime.directory, 'tsconfig.json'))
  await FileSystem.writeIfChanged(Path.join(nextDirectory, 'tsconfig.json'), configuration)
  const targetLink = Path.join(nextDirectory, 'node_modules')
  const dependencyTarget = Path.join(runtime.directory, 'node_modules')
  await FileSystem.symlink(Path.relative(nextDirectory, dependencyTarget), targetLink, 'dir')
}

function serializePublishedBuildConfiguration(extendsPath: string): string {
  return `${JSON.stringify({ extends: extendsPath, include: ['./**/*.ts', './**/*.tsx'] }, null, 2)}\n`
}

async function writeSnapshotFiles(
  nextDirectory: string,
  files: GeneratedRevision['files'],
): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    const path = resolveGeneratedPath(nextDirectory, file)
    await FileSystem.mkdir(Path.dirname(path))
    await FileSystem.writeFile(path, content)
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
  const parent = Path.dirname(directory)
  const revisions = `${directory}.revisions`
  await FileSystem.mkdir(parent)
  const current = await Try.WithDefault(undefined, () => FileSystem.lstatSync(directory))
  const previous = current?.isSymbolicLink()
    ? await Try.WithDefault(undefined, () => FileSystem.realpathSync(directory))
    : undefined
  if (current?.isDirectory() && !current.isSymbolicLink()) {
    const initial = `${directory}.${Platform.randomUUID()}.initial`
    await FileSystem.rename(directory, initial)
    await Try(async () => {
      await FileSystem.replaceDirectoryLink(Path.relative(parent, revisionDirectory), directory)
    }, {
      async catch(error) {
        await FileSystem.rename(initial, directory)
        Errors.Throw(error)
      },
    })
    await FileSystem.rm(initial, { recursive: true, force: true })
  } else {
    await FileSystem.replaceDirectoryLink(Path.relative(parent, revisionDirectory), directory)
  }
  const currentDirectory = await Try.WithDefault(revisionDirectory, () => FileSystem.realpathSync(directory))
  await removeOldSnapshots(revisions, currentDirectory, previous)
})

async function removeOldSnapshots(
  revisions: string,
  currentDirectory: string,
  previousDirectory?: string,
): Promise<void> {
  for (const entry of await FileSystem.readdir(revisions)) {
    const path = Path.join(revisions, entry)
    const target = await Try.WithDefault(path, () => FileSystem.realpathSync(path))
    if (target !== currentDirectory && target !== previousDirectory) {
      await FileSystem.rm(path, { recursive: true, force: true })
    }
  }
}

const publishChanged = Timings.measured('workspace.runtime.publish-changed', async function(
  snapshot: string,
  runtime: RuntimeApplication,
  files: GeneratedRevision['files'],
  previousFiles: PreviousGeneratedFiles,
  isCurrent: () => boolean,
): Promise<void> {
  if (!isCurrent()) {
    return
  }
  await writeAtomicGeneratedFiles(Path.join(runtime.directory, 'src'), files, isCurrent)
  for (const file of Object.keys(previousFiles ?? {})) {
    if (!(file in files)) {
      await FileSystem.rm(resolveGeneratedPath(Path.join(runtime.directory, 'src'), file), { force: true })
    }
  }
  const mirrored = await FileSystem.readFile(Path.join(snapshot, 'App.tsx'), 'utf8')
  if (mirrored !== files['App.tsx']) {
    Errors.ThrowUserInput('Generated app build changed while publishing.')
  }
})

async function writeAtomicGeneratedFiles(
  directory: string,
  files: GeneratedRevision['files'],
  isCurrent: () => boolean,
): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    if (!isCurrent()) {
      return
    }
    const path = resolveGeneratedPath(directory, file)
    await FileSystem.mkdir(Path.dirname(path))
    const previous = await Try.WithDefault(undefined, () => FileSystem.readFile(path, 'utf8'))
    if (previous !== content) {
      await writeAtomic(path, content, isCurrent)
    }
  }
}

async function writeAtomic(path: string, content: string, isCurrent: () => boolean): Promise<void> {
  const pending = `${path}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FileSystem.writeFile(pending, content)
    if (isCurrent()) {
      await FileSystem.rename(pending, path)
    }
  }, {
    finally: () => FileSystem.rm(pending, { force: true }),
  })
}
