import type { GeneratedRevision, PublicationOutcome } from '@runtime/expo/PreviewProtocol'
import type { RuntimeApplication } from '@runtime/Runtime'
import { Time, Timings, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { publishBuild } from '../WorkspaceBuild'

Tests.test('seeds a disk build once, then hands the next complete revision to the live publisher', async () => {
  const root = Artifacts.resolvePath('tmp', `workspace-build-${Platform.randomUUID()}`)
  const buildDirectory = Path.join(root, 'build')
  const appPath = Path.join(root, 'runtime', 'App.tsx')
  const initialCode = 'export default function App() { return "initial" }'
  const nextCode = 'export default function App() { return "live" }'
  const runtime: RuntimeApplication = { directory: Path.dirname(appPath), appPath }
  const published: GeneratedRevision[] = []

  await Try(async () => {
    await FileSystem.mkdir(Path.dirname(appPath), { recursive: true })
    await FileSystem.writeFile(appPath, initialCode)
    await publishWithTimings(buildDirectory, initialCode, 'revision-1', async () => runtime, () => true)
    Tests.expect(await FileSystem.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(initialCode)
    Tests.expect(runtime.generated).toEqual({ revision: 'revision-1', sequence: 1, files: { 'App.tsx': initialCode } })

    const originalBuild = await FileSystem.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')
    const originalRuntime = await FileSystem.readFile(appPath, 'utf8')
    const outcome = await publishWithTimings(
      buildDirectory,
      nextCode,
      'revision-2',
      async () => ({
        ...runtime,
        async publishGenerated(snapshot) {
          published.push(snapshot)
          return publishedOutcome(snapshot, 'published')
        },
      }),
      () => true,
    )

    Tests.expect(outcome?.status).toBe('published')
    Tests.expect(published).toEqual([{ revision: 'revision-2', sequence: 2, files: { 'App.tsx': nextCode } }])
    Tests.expect(await FileSystem.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(originalBuild)
    Tests.expect(await FileSystem.readFile(appPath, 'utf8')).toBe(originalRuntime)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('a build superseded during runtime preparation never reaches the live publisher', async () => {
  const published: GeneratedRevision[] = []
  let current = true
  const outcome = await publishWithTimings(
    '/unused-build',
    'new app source',
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

Tests.test('waits for server publication, preserves noop, and recovers after a rejected server outcome', async () => {
  await verifyDeferredPublicationRecovery()
})

async function verifyDeferredPublicationRecovery(): Promise<void> {
  const published: GeneratedRevision[] = []
  const runtime: RuntimeApplication = {
    directory: '/runtime',
    appPath: '/runtime/App.tsx',
    generated: { revision: 'revision-0', sequence: 0, files: { 'App.tsx': 'old' } },
  }
  const deferred = createDeferredPublication()
  runtime.publishGenerated = async snapshot => {
    published.push(snapshot)
    deferred.start()
    return await deferred.promise
  }

  const pending = publishWithTimings('/unused-build', 'same output', 'revision-1', async () => runtime, () => true)
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

async function verifyRecoveredPublication(runtime: RuntimeApplication, published: GeneratedRevision[]): Promise<void> {
  runtime.publishGenerated = async snapshot => {
    published.push(snapshot)
    return publishedOutcome(snapshot, 'error', 'Metro rejected this revision.')
  }
  await Tests.rejects(
    publishWithTimings('/unused-build', 'repaired output', 'revision-2', async () => runtime, () => true),
    /Metro rejected this revision\./,
  )
  runtime.publishGenerated = async snapshot => {
    published.push(snapshot)
    return publishedOutcome(snapshot, 'published')
  }
  const recovered = await publishWithTimings(
    '/unused-build',
    'repaired output',
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
  code: string,
  revision: string,
  prepareRuntime: () => Promise<RuntimeApplication>,
  isCurrent: () => boolean,
): Promise<PublicationOutcome | undefined> {
  return await Timings.createTopLevelTimer(timings =>
    publishBuild(buildDirectory, code, revision, prepareRuntime, isCurrent, timings)
  )()
}

function publishedOutcome(
  revision: GeneratedRevision,
  status: PublicationOutcome['status'],
  message?: string,
): PublicationOutcome {
  return {
    sessionId: 'session-fixture',
    revision: revision.revision,
    sequence: revision.sequence,
    status,
    publishedRevision: status === 'published' ? revision.revision : 'previous-revision',
    ...(message ? { message } : {}),
  }
}

function createDeferredPublication(): {
  promise: Promise<PublicationOutcome>
  start(): void
  complete(outcome: PublicationOutcome): void
  wait(): Promise<void>
} {
  let resolvePublication: (outcome: PublicationOutcome) => void = () => {}
  let started = false
  const promise = new Promise<PublicationOutcome>(resolve => {
    resolvePublication = resolve
  })
  return {
    promise,
    start() {
      started = true
    },
    complete: outcome => resolvePublication(outcome),
    async wait() {
      while (!started) {
        await Time.sleep(0)
      }
    },
  }
}
