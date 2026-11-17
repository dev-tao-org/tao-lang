import type * as Compile from '@compile'
import * as Runtime from '@runtime'

import { Errors, Timings, Try } from '@shared'
import * as Shared from '@shared'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import { Document } from '../Document'
import { discoverProject } from '../projects/Projects'
import { openProjectWorkspace, type ProjectWorkspaceOptions } from '../ProjectWorkspace'
import { createWorkspace, type WorkspaceSession } from '../Workspace'
import type { AppTestDevice, AppTestTarget } from './AppTests'
import type { TestDriver, TestProgress } from './RunTests'

/** createAppTestDriver owns the compiler, Expo and device lifetime of one app test. */
export async function createAppTestDriver(
  path: string,
  source: string,
  target: AppTestTarget,
  compileApp: typeof Compile.compile,
  onProgress?: TestProgress,
  signal?: AbortSignal,
): Promise<TestDriver> {
  const state: Session = { platform: target.platform }
  const context = { path, source, target, compileApp, onProgress, signal }
  const abort = listenForAbort(state, signal)
  return {
    run: app => runAppTestSession(app, state, context),
    press: tag => getDevice(state).press(tag),
    type: (tag, value) => getDevice(state).type(tag, value),
    expectText: (value, tag) => getDevice(state).expectText(value, tag),
    expectInput: (tag, value) => getDevice(state).expectInput(tag, value),
    dispose: () => disposeAppTestSession(state, context, abort),
  }
}

type TestWorkspace = WorkspaceSession

type DriverContext = {
  path: string
  source: string
  target: AppTestTarget
  compileApp: typeof Compile.compile
  onProgress?: TestProgress
  signal?: AbortSignal
}

type Session = {
  platform: Runtime.ExpoPlatform
  workspace?: TestWorkspace
  expo?: Runtime.ExpoSession
  device?: AppTestDevice
}

function listenForAbort(state: Session, signal?: AbortSignal): () => void {
  const abort = () => {
    void Try.IgnoreError(async () => await state.device?.dispose())
  }
  signal?.addEventListener('abort', abort, { once: true })
  return abort
}

async function runAppTestSession(app: string, state: Session, context: DriverContext): Promise<void> {
  const { path, source, target, compileApp, onProgress, signal } = context
  assertActive(signal)
  state.workspace = await createTestWorkspace(path, app, compileApp, target.platform)
  onProgress?.(`Compiling app ${app}…`)
  const result = await state.workspace.update(new Document(path, source))
  assertActive(signal)
  if (result.status !== 'published') {
    Errors.ThrowUserInput(result.status === 'failed' ? result.error : `App test compilation was ${result.status}.`)
  }
  onProgress?.('Starting Expo…')
  state.expo = await Runtime.start(state.workspace.runtime!, { signal, platform: target.platform })
  assertActive(signal)
  await openAppTestDevice(state, context)
  onProgress?.('Running test steps…')
}

async function openAppTestDevice(state: Session, context: DriverContext): Promise<void> {
  const { target, onProgress, signal } = context
  onProgress?.(`Opening ${target.platform} test target…`)
  state.device = await target.openDevice()
  assertActive(signal)
  onProgress?.('Loading app…')
  await state.device.open(state.expo!.url)
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    Errors.ThrowHostEnvironment('Tao test run interrupted.')
  }
}

async function disposeAppTestSession(state: Session, context: DriverContext, abort: () => void): Promise<void> {
  context.signal?.removeEventListener('abort', abort)
  context.onProgress?.('Cleaning up…')
  await disposeSession(state)
  context.onProgress?.('Cleanup complete.')
}

async function createTestWorkspace(
  path: string,
  app: string,
  compileApp: typeof Compile.compile,
  platform: Runtime.ExpoPlatform,
) {
  const runtimeOptions = {
    platform,
    toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains'),
    install: {
      async install(directory: string) {
        await FS.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  }
  await Runtime.prepareRuntime(runtimeOptions)
  const compile: typeof compileApp = Timings.createTopLevelTimer((timings, input, options) =>
    timings.run(compileApp, input, selectCompilationApp(options, app))
  )
  if (await discoverProject(path)) {
    return await openTestProject(path, app, platform, { runtimeOptions, compile })
  }
  await Artifacts.mkdir(Artifacts.resolvePath('tmp', 'app-tests'))
  const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'app-tests', 'app-'))
  Artifacts.trackTemporary(directory)
  return createWorkspace({ outputDirectory: directory, runtimeOptions, compile })
}

function selectCompilationApp(options: Compile.CompileOptions, app: string): Compile.CompileOptions {
  return { ...options, app }
}

async function openTestProject(
  path: string,
  app: string,
  platform: Runtime.ExpoPlatform,
  options: ProjectWorkspaceOptions,
) {
  const prefix = `test-${Platform.hashText(`${Path.resolve(path)}:${app}:${platform}`).slice(0, 16)}`
  for (let slot = 0; slot < 16; slot++) {
    const id = `${prefix}-${slot}`
    const sessionOptions = selectTestSession(options, id)
    const workspace = await Try(() => openProjectWorkspace(path, sessionOptions), {
      catch(error) {
        if (!Errors.isTaoError(error) || error.message !== `Project session is already active: ${id}`) {
          Errors.Throw(error)
        }
        return undefined
      },
    })
    if (workspace) {
      return workspace
    }
  }
  return Errors.ThrowHostEnvironment(`All app-test sessions are active for ${path}; retry after a run finishes.`)
}

function selectTestSession(options: ProjectWorkspaceOptions, id: string) {
  return { ...options, id }
}

function getDevice(state: Session): AppTestDevice {
  return state.device ?? Errors.ThrowShouldNeverHappen('Run an app before interacting with it.')
}

async function disposeSession(state: Session): Promise<void> {
  await Try(() => state.device?.dispose(), { finally: () => disposeExpoSession(state) })
}

async function disposeExpoSession(state: Session): Promise<void> {
  await Try(() => state.expo?.dispose(), { finally: () => disposeWorkspaceSession(state) })
}

async function disposeWorkspaceSession(state: Session): Promise<void> {
  await Try(() => retainExpoOutput(state), { finally: () => state.workspace?.dispose() })
}

async function retainExpoOutput(state: Session): Promise<void> {
  if (!state.expo || !state.workspace?.runtime) {
    return
  }
  const output = await state.expo.output()
  const log = Shared.joinTextLines(output.stdout, output.stderr)
  await FS.writeFile(Path.join(state.workspace.runtime.directory, 'expo.log'), log)
  if (state.platform !== 'web') {
    const directory = Artifacts.resolvePath('logs', 'native-journeys', 'authored-apps')
    await FS.mkdir(directory)
    await FS.writeFile(Path.join(directory, `${state.platform}-${Platform.randomUUID()}.log`), log)
  }
}
