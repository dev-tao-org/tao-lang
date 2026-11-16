import type * as Runtime from '@runtime'
import type * as Expo from '@runtime/expo'
import * as Tests from '@shared-tests'

import { Timings, Try } from '@shared'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { publishBuild } from '../workspace-src/Workspace'

const MetroRevisionRejectionErrorRegx = /Metro rejected this revision\./
const PreviewPublicationFailureErrorRegx = /Preview publication failed: error/

Tests.test('seeds a disk build once, then hands the next complete revision to the live publisher', async () => {
  const root = Artifacts.resolvePath('tmp', `workspace-build-${Platform.randomUUID()}`)
  await Try(() => verifyDiskAndMemoryPublication(root), {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

async function verifyDiskAndMemoryPublication(root: string): Promise<void> {
  const buildDirectory = Path.join(root, 'build')
  const appPath = Path.join(root, 'runtime', 'src/App.tsx')
  const initialFiles = {
    'App.tsx': 'export default function App() { return "initial" }',
    'source/Card.ts': 'export const label = "initial"',
  }
  const nextFiles = {
    'App.tsx': 'export default function App() { return "live" }',
    'source/NewCard.ts': 'export const label = "live"',
  }
  const runtime: Runtime.RuntimeApplication = { directory: Path.dirname(appPath), appPath }
  const published: Expo.GeneratedRevision[] = []

  await FS.mkdir(Path.dirname(appPath))
  await FS.writeFile(appPath, initialFiles['App.tsx'])
  await publishWithTimings(buildDirectory, initialFiles, 'revision-1', async () => runtime, () => true)
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(initialFiles['App.tsx'])
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'source/Card.ts'), 'utf8')).toBe(
    initialFiles['source/Card.ts'],
  )
  Tests.expect(runtime.generated).toEqual({ revision: 'revision-1', sequence: 1, files: initialFiles })

  const originalRuntime = await FS.readFile(appPath, 'utf8')
  const memoryRuntime: Runtime.RuntimeApplication = {
    ...runtime,
    async publishGenerated(snapshot) {
      published.push(snapshot)
      return publishedOutcome(snapshot, 'published')
    },
  }
  await verifyAcceptedMemoryPublication(buildDirectory, nextFiles, published, memoryRuntime, appPath, originalRuntime)
  await verifyRejectedMemoryPublications(buildDirectory, memoryRuntime, nextFiles)
}

async function verifyAcceptedMemoryPublication(
  buildDirectory: string,
  nextFiles: Record<string, string>,
  published: Expo.GeneratedRevision[],
  memoryRuntime: Runtime.RuntimeApplication,
  appPath: string,
  originalRuntime: string,
): Promise<void> {
  const outcome = await publishWithTimings(
    buildDirectory,
    nextFiles,
    'revision-2',
    async () => memoryRuntime,
    () => true,
  )

  Tests.expect(outcome?.status).toBe('published')
  Tests.expect(published).toEqual([{ revision: 'revision-2', sequence: 2, files: nextFiles }])
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(nextFiles['App.tsx'])
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'source/NewCard.ts'), 'utf8')).toBe(
    nextFiles['source/NewCard.ts'],
  )
  Tests.expect(await FS.exists(Path.join(buildDirectory, 'source/Card.ts'))).toBe(false)
  Tests.expect(await FS.readFile(appPath, 'utf8')).toBe(originalRuntime)
}

async function verifyRejectedMemoryPublications(
  buildDirectory: string,
  memoryRuntime: Runtime.RuntimeApplication,
  nextFiles: Record<string, string>,
): Promise<void> {
  await Tests.rejects(
    publishWithTimings(buildDirectory, { 'App.tsx': 'rejected' }, 'revision-error', async () => ({
      ...memoryRuntime,
      publishGenerated: async snapshot => publishedOutcome(snapshot, 'error', 'Metro rejected this revision.'),
    }), () => true),
    MetroRevisionRejectionErrorRegx,
  )
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(nextFiles['App.tsx'])
  const superseded = await publishWithTimings(
    buildDirectory,
    { 'App.tsx': 'superseded' },
    'revision-superseded',
    async () => ({
      ...memoryRuntime,
      publishGenerated: async snapshot => publishedOutcome(snapshot, 'superseded'),
    }),
    () => true,
  )
  Tests.expect(superseded?.status).toBe('superseded')
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(nextFiles['App.tsx'])
  await Tests.rejects(
    publishWithTimings(
      buildDirectory,
      {
        'App.tsx': 'committed with error',
        'source/Committed.ts': 'export {}',
      },
      'revision-committed-error',
      async () => ({
        ...memoryRuntime,
        publishGenerated: async snapshot => ({
          ...publishedOutcome(snapshot, 'error'),
          publishedRevision: snapshot.revision,
        }),
      }),
      () => true,
    ),
    PreviewPublicationFailureErrorRegx,
  )
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe('committed with error')
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'source/Committed.ts'), 'utf8')).toBe('export {}')
}

Tests.test('a build superseded during runtime preparation never reaches the live publisher', async () => {
  const published: Expo.GeneratedRevision[] = []
  let current = true
  const outcome = await publishWithTimings(
    '/unused-build',
    { 'App.tsx': 'new app source', 'source/Card.ts': 'export {}' },
    'revision-stale',
    async () => {
      current = false
      return {
        directory: '/runtime',
        appPath: '/runtime/App.tsx',
        async publishGenerated(snapshot) {
          published.push(snapshot)
          return publishedOutcome(snapshot, 'published')
        },
      }
    },
    () => current,
  )

  Tests.expect(outcome).toBeUndefined()
  Tests.expect(published).toEqual([])
})

Tests.test('a build that becomes stale before the atomic mirror swap preserves the current mirror', async () => {
  const root = Artifacts.resolvePath('tmp', `workspace-build-stale-mirror-${Platform.randomUUID()}`)
  const buildDirectory = Path.join(root, 'build')
  const runtimeDirectory = Path.join(root, 'runtime')
  const appPath = Path.join(runtimeDirectory, 'src/App.tsx')
  const runtime: Runtime.RuntimeApplication = { directory: runtimeDirectory, appPath }
  await Try(async () => {
    await FS.mkdir(Path.dirname(appPath))
    await FS.writeFile(appPath, 'initial')
    await publishWithTimings(buildDirectory, { 'App.tsx': 'initial' }, 'revision-1', async () => runtime, () => true)
    let checks = 0
    const outcome = await publishWithTimings(
      buildDirectory,
      { 'App.tsx': 'stale' },
      'revision-stale',
      async () => runtime,
      () => ++checks < 8,
    )
    Tests.expect(outcome).toBeUndefined()
    Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe('initial')
    Tests.expect(runtime.generated?.revision).toBe('revision-1')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('mirrors a committed memory revision after its source becomes stale', async () => {
  const root = Artifacts.resolvePath('tmp', `workspace-build-committed-mirror-${Platform.randomUUID()}`)
  const buildDirectory = Path.join(root, 'build')
  const appPath = Path.join(root, 'runtime/src/App.tsx')
  const runtime: Runtime.RuntimeApplication = { directory: Path.dirname(appPath), appPath }
  await Try(async () => {
    await FS.mkdir(Path.dirname(appPath))
    await FS.writeFile(appPath, 'initial')
    await publishWithTimings(buildDirectory, { 'App.tsx': 'initial' }, 'revision-1', async () => runtime, () => true)
    let current = true
    runtime.publishGenerated = async snapshot => {
      current = false
      return publishedOutcome(snapshot, 'published')
    }
    const outcome = await publishWithTimings(
      buildDirectory,
      { 'App.tsx': 'committed' },
      'revision-2',
      async () => runtime,
      () => current,
    )
    Tests.expect(outcome?.status).toBe('published')
    Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe('committed')
    Tests.expect(runtime.generated?.revision).toBe('revision-2')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('waits for server publication, preserves noop, and recovers after a rejected server outcome', async () => {
  await verifyDeferredPublicationRecovery()
})

async function verifyDeferredPublicationRecovery(): Promise<void> {
  const published: Expo.GeneratedRevision[] = []
  const oldFiles = { 'App.tsx': 'old' }
  const runtime: Runtime.RuntimeApplication = {
    directory: '/runtime',
    appPath: '/runtime/App.tsx',
    generated: { revision: 'revision-0', sequence: 0, files: oldFiles },
  }
  const deferred = createDeferredPublication()
  runtime.publishGenerated = async snapshot => {
    published.push(snapshot)
    deferred.start()
    return await deferred.promise
  }

  const pending = publishWithTimings(
    '/unused-build',
    { 'App.tsx': 'same output' },
    'revision-1',
    async () => runtime,
    () => true,
  )
  await deferred.wait()
  let completed = false
  void pending.then(() => {
    completed = true
  })
  await Promise.resolve()
  Tests.expect(completed).toBe(false)
  const noopRevision = published[0]
  deferred.complete(publishedOutcome(noopRevision, 'noop'))
  Tests.expect((await pending)?.status).toBe('noop')
  Tests.expect(runtime.generated).toEqual({ revision: 'revision-0', sequence: 0, files: { 'App.tsx': 'old' } })

  await verifyRecoveredPublication(runtime, published)
}

async function verifyRecoveredPublication(
  runtime: Runtime.RuntimeApplication,
  published: Expo.GeneratedRevision[],
): Promise<void> {
  runtime.publishGenerated = async snapshot => {
    published.push(snapshot)
    return publishedOutcome(snapshot, 'error', 'Metro rejected this revision.')
  }
  await Tests.rejects(
    publishWithTimings(
      '/unused-build',
      { 'App.tsx': 'repaired output' },
      'revision-2',
      async () => runtime,
      () => true,
    ),
    MetroRevisionRejectionErrorRegx,
  )
  runtime.publishGenerated = async snapshot => {
    published.push(snapshot)
    return publishedOutcome(snapshot, 'published')
  }
  const recovered = await publishWithTimings(
    '/unused-build',
    { 'App.tsx': 'repaired output' },
    'revision-3',
    async () => runtime,
    () => true,
  )

  Tests.expect(recovered?.revision).toBe('revision-3')
  Tests.expect(recovered?.status).toBe('published')
  Tests.expect(published.map(revision => revision.sequence)).toEqual([1, 2, 3])
  Tests.expect(runtime.generated?.revision).toBe('revision-3')
}

async function publishWithTimings(
  buildDirectory: string,
  files: Readonly<Record<string, string>>,
  revision: string,
  prepareRuntime: () => Promise<Runtime.RuntimeApplication>,
  isCurrent: () => boolean,
): Promise<Expo.PublicationOutcome | undefined> {
  return await Timings.createTopLevelTimer(timings =>
    publishBuild(buildDirectory, files, revision, prepareRuntime, isCurrent, timings)
  )()
}

function publishedOutcome(
  revision: Expo.GeneratedRevision,
  status: Expo.PublicationOutcome['status'],
  message?: string,
): Expo.PublicationOutcome {
  return {
    sessionId: 'session-fixture',
    revision: revision.revision,
    sequence: revision.sequence,
    status,
    publishedRevision: status === 'published' ? revision.revision : 'previous-revision',
    ...(message ? { message } : {}),
  }
}

type DeferredPublication = {
  promise: Promise<Expo.PublicationOutcome>
  start(): void
  complete(outcome: Expo.PublicationOutcome): void
  wait(): Promise<void>
}

function createDeferredPublication(): DeferredPublication {
  const publication = Promise.withResolvers<Expo.PublicationOutcome>()
  const started = Promise.withResolvers<void>()
  return {
    promise: publication.promise,
    start: () => started.resolve(),
    complete: outcome => publication.resolve(outcome),
    wait: () => started.promise,
  }
}
