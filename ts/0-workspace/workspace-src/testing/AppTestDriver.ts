import type * as Compile from '@compile'
import * as Runtime from '@runtime'

import * as Shared from '@shared'
import { Errors, Timings, Try, UserInput } from '@shared'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import { Document } from '../Document'
import { discoverProject } from '../projects/Projects'
import { openProjectWorkspace, type ProjectWorkspaceOptions } from '../ProjectWorkspace'
import { createWorkspace, type WorkspaceSession } from '../Workspace'
import type { TestBrowser } from './AppTests'
import type { TestDriver, TestProgress } from './RunTests'

/** createAppTestDriver owns the compiler, Expo and browser lifetime of one app test. */
export async function createAppTestDriver(
  path: string,
  source: string,
  openBrowser: () => Promise<TestBrowser>,
  compileApp: typeof Compile.compile,
  onProgress?: TestProgress,
  signal?: AbortSignal,
): Promise<TestDriver> {
  const state: Session = {}
  const context = { path, source, openBrowser, compileApp, onProgress, signal }
  const abort = listenForAbort(state, signal)
  return {
    run: app => runAppTestSession(app, state, context),
    press: tag => getBrowser(state).press(tag),
    type: (tag, value) => getBrowser(state).type(tag, value),
    expectText: (value, tag) => getBrowser(state).expectText(value, tag),
    expectInput: (tag, value) => getBrowser(state).expectInput(tag, value),
    dispose: () => disposeAppTestSession(state, context, abort),
  }
}

type TestWorkspace = WorkspaceSession

type DriverContext = {
  path: string
  source: string
  openBrowser: () => Promise<TestBrowser>
  compileApp: typeof Compile.compile
  onProgress?: TestProgress
  signal?: AbortSignal
}

type Session = {
  workspace?: TestWorkspace
  expo?: Runtime.ExpoSession
  browser?: TestBrowser
}

function listenForAbort(state: Session, signal?: AbortSignal): () => void {
  const abort = () => {
    void Try.IgnoreError(async () => await state.browser?.dispose())
  }
  signal?.addEventListener('abort', abort, { once: true })
  return abort
}

async function runAppTestSession(app: string, state: Session, context: DriverContext): Promise<void> {
  const { path, source, compileApp, onProgress, signal } = context
  assertActive(signal)
  state.workspace = await createTestWorkspace(path, app, compileApp)
  onProgress?.(`Compiling app ${app}…`)
  const result = await state.workspace.update(new Document(path, source))
  assertActive(signal)
  if (result.status !== 'published') {
    UserInput.Fail(result.status === 'failed' ? result.error : `App test compilation was ${result.status}.`)
  }
  onProgress?.('Starting Expo…')
  state.expo = await Runtime.start(state.workspace.runtime!, { signal })
  assertActive(signal)
  await openAppTestBrowser(state, context)
  onProgress?.('Running test steps…')
}

async function openAppTestBrowser(state: Session, context: DriverContext): Promise<void> {
  const { openBrowser, onProgress, signal } = context
  onProgress?.('Launching headless browser…')
  state.browser = await openBrowser()
  assertActive(signal)
  onProgress?.('Loading app…')
  await state.browser.open(state.expo!.url)
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

async function createTestWorkspace(path: string, app: string, compileApp: typeof Compile.compile) {
  const runtimeOptions = {
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
    return await openTestProject(path, app, { runtimeOptions, compile })
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
  options: ProjectWorkspaceOptions,
) {
  const prefix = `test-${Platform.hashText(`${Path.resolve(path)}:${app}`).slice(0, 16)}`
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

function getBrowser(state: Session): TestBrowser {
  return state.browser ?? Errors.ThrowShouldNeverHappen('Run an app before interacting with it.')
}

async function disposeSession(state: Session): Promise<void> {
  await Try(() => state.browser?.dispose(), { finally: () => disposeExpoSession(state) })
}

async function disposeExpoSession(state: Session): Promise<void> {
  await Try(() => state.expo?.dispose(), { finally: () => disposeWorkspaceSession(state) })
}

async function disposeWorkspaceSession(state: Session): Promise<void> {
  await Try(() => retainExpoOutput(state), { finally: () => state.workspace?.dispose() })
}

async function retainExpoOutput(state: Session): Promise<void> {
  if (state.expo && state.workspace?.runtime) {
    const output = await state.expo.output()
    await FS.writeFile(
      Path.join(state.workspace.runtime.directory, 'expo.log'),
      Shared.joinTextLines(output.stdout, output.stderr),
    )
  }
}
