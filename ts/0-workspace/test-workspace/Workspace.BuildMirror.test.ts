import type * as Runtime from '@runtime'
import { Timings, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { publishBuild } from '../workspace-src/Workspace/WorkspaceBuild'

Tests.test('repairs a missing or dangling memory-build mirror', async () => {
  const root = Artifacts.resolvePath('tmp', `workspace-build-repair-${Platform.randomUUID()}`)
  await Try(async () => {
    await verifyMissingMirror(Path.join(root, 'missing'))
    await verifyDanglingMirror(Path.join(root, 'dangling'))
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('rewrites corrupted unchanged files in the memory-build mirror', async () => {
  const root = Artifacts.resolvePath('tmp', `workspace-build-corrupt-${Platform.randomUUID()}`)
  const buildDirectory = Path.join(root, 'build')
  const files = {
    'App.tsx': 'export default function App() { return "app" }',
    'source/Card.ts': 'export const card = 1',
  }
  const runtime = createRuntime(root)
  await Try(async () => {
    await seedMemoryMirror(buildDirectory, runtime, files)
    await FS.writeFile(Path.join(buildDirectory, 'App.tsx'), 'corrupt app')
    await FS.writeFile(Path.join(buildDirectory, 'source/Card.ts'), 'corrupt card')
    await publishBuildWithTiming(buildDirectory, files, 'revision-2', runtime)
    Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(files['App.tsx'])
    Tests.expect(await FS.readFile(Path.join(buildDirectory, 'source/Card.ts'), 'utf8')).toBe(files['source/Card.ts'])
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

async function verifyMissingMirror(buildDirectory: string): Promise<void> {
  const root = Path.dirname(buildDirectory)
  const runtime = createRuntime(root)
  const files = { 'App.tsx': 'export default function App() { return "app" }' }
  await seedMemoryMirror(buildDirectory, runtime, files)
  await FS.rm(buildDirectory, { recursive: true, force: true })
  await publishBuildWithTiming(buildDirectory, files, 'revision-2', runtime)
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(files['App.tsx'])
}

async function verifyDanglingMirror(buildDirectory: string): Promise<void> {
  const root = Path.dirname(buildDirectory)
  const runtime = createRuntime(root)
  const files = { 'App.tsx': 'export default function App() { return "app" }' }
  await seedMemoryMirror(buildDirectory, runtime, files)
  await FS.rm(buildDirectory, { recursive: true, force: true })
  await FS.symlink(Path.join(root, 'missing-target'), buildDirectory, 'dir')
  await publishBuildWithTiming(buildDirectory, files, 'revision-2', runtime)
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe(files['App.tsx'])
}

async function seedMemoryMirror(
  buildDirectory: string,
  runtime: Runtime.RuntimeApplication,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await publishBuildWithTiming(buildDirectory, files, 'revision-1', runtime)
  runtime.publishGenerated = async generated => ({
    sessionId: 'session-fixture',
    revision: generated.revision,
    sequence: generated.sequence,
    status: 'published',
    publishedRevision: generated.revision,
  })
}

async function publishBuildWithTiming(
  buildDirectory: string,
  files: Readonly<Record<string, string>>,
  revision: string,
  runtime: Runtime.RuntimeApplication,
): Promise<void> {
  await Timings.createTopLevelTimer(timings =>
    publishBuild(buildDirectory, files, revision, async () => runtime, () => true, timings)
  )()
}

function createRuntime(root: string): Runtime.RuntimeApplication {
  const appPath = Path.join(root, 'runtime/src/App.tsx')
  return { directory: Path.dirname(appPath), appPath }
}
