import type * as Runtime from '@runtime'
import { Json, S, Timings, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { publishBuild } from '../workspace-src/Workspace/WorkspaceBuild'

Tests.test('a failed old-build cleanup preserves the installed revision inventory', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/workspace-build-cleanup-'))
  await Try(async () => {
    const script = createCleanupFailureProbe(root, 'mock')
    const result = await Exec.captureStdout('bun', ['-e', script], { cwd: Repo.resolvePath('ts/0-workspace') })
    Tests.expect(result).toBe('1 second third')
    Tests.expect(await FS.exists(Path.join(root, 'runtime/src/Removed.ts'))).toBe(false)
    Tests.expect(await FS.readFile(Path.join(root, 'build/App.tsx'), 'utf8')).toBe('third')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

function createCleanupFailureProbe(root: string, mockExport: keyof Pick<typeof Tests, 'mock'>): string {
  const workspaceBuild = Repo.resolvePath('ts/0-workspace/workspace-src/Workspace/WorkspaceBuild.ts')
  return S`
    const { ${mockExport}: mock } = await import('@shared-tests');
    const os = await import('@shared/os');
    const { FS, Path } = os;
    const remove = FS.rm;
    let failures = 0;
    mock.module('@shared/os', () => ({ ...os, FS: { ...FS, async rm(path, options) {
      if (path.endsWith('.previous') && failures === 0) {
        failures++;
        throw new Error('the displaced tree is locked');
      }
      return remove(path, options);
    }}}));
    const { Timings } = await import('@shared');
    const { publishBuild } = await import(${Json.Print(workspaceBuild)});
    const root = ${Json.Print(root)};
    const directory = Path.join(root, 'runtime');
    const runtime = { directory, appPath: Path.join(directory, 'src/App.tsx') };
    const publish = (revision, files) => Timings.createTopLevelTimer(timings =>
      publishBuild(Path.join(root, 'build'), files, revision, async () => runtime, () => true, timings))();
    await publish('first', { 'App.tsx': 'first' });
    await publish('second', { 'App.tsx': 'second', 'Removed.ts': 'export {}' });
    const installed = runtime.generated.revision;
    await publish('third', { 'App.tsx': 'third' });
    console.log(failures, installed, runtime.generated.revision);
  `
}

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
