import type { compile } from '@compile/Compile'
import * as Runtime from '@runtime/Runtime'
import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo } from '@shared/os'
import { Document } from '../Document'
import { discoverProject } from '../projects/Projects'
import { openProjectWorkspace } from '../ProjectWorkspace'
import { createWorkspace } from '../Workspace'
import type { TestBrowser } from './AppTests'
import type { TestDriver, TestProgress } from './RunTests'

/** createAppTestDriver owns the compiler, Expo and browser lifetime of one app test. */
export async function createAppTestDriver(
  path: string,
  source: string,
  openBrowser: () => Promise<TestBrowser>,
  compileApp: typeof compile,
  onProgress?: TestProgress,
  signal?: AbortSignal,
): Promise<TestDriver> {
  const state: Session = {}
  const abort = () => {
    void Try.WithDefault(undefined, async () => await state.browser?.dispose())
  }
  signal?.addEventListener('abort', abort, { once: true })
  return {
    async run(app) {
      assertActive(signal)
      state.workspace = await createTestWorkspace(path, app, compileApp)
      onProgress?.(`Compiling app ${app}…`)
      const result = await state.workspace.update(new Document(path, source))
      assertActive(signal)
      if (result.status !== 'published') {
        Errors.ThrowUserInput(result.status === 'failed' ? result.error : `App test compilation was ${result.status}.`)
      }
      onProgress?.('Starting Expo…')
      state.expo = await Runtime.start(state.workspace.runtime!, { signal })
      assertActive(signal)
      onProgress?.('Launching headless browser…')
      state.browser = await openBrowser()
      assertActive(signal)
      onProgress?.('Loading app…')
      await state.browser.open(state.expo.url)
      onProgress?.('Running test steps…')
    },
    press: tag => browser(state).press(tag),
    type: (tag, value) => browser(state).type(tag, value),
    expectText: (value, tag) => browser(state).expectText(value, tag),
    expectInput: (tag, value) => browser(state).expectInput(tag, value),
    async dispose() {
      signal?.removeEventListener('abort', abort)
      onProgress?.('Cleaning up…')
      await disposeSession(state)
      onProgress?.('Cleanup complete.')
    },
  }
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    Errors.ThrowHostEnvironment('Tao test run interrupted.')
  }
}

type Session = {
  workspace?: ReturnType<typeof createWorkspace> | Awaited<ReturnType<typeof openProjectWorkspace>>
  expo?: Runtime.ExpoSession
  browser?: TestBrowser
}

async function createTestWorkspace(path: string, app: string, compileApp: typeof compile) {
  const runtimeOptions = {
    toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains'),
    install: {
      async install(directory: string) {
        await FileSystem.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  }
  await Runtime.prepareRuntime(runtimeOptions)
  const compile: typeof compileApp = (input, options, timings) => compileApp(input, { ...options, app }, timings)
  if (await discoverProject(path)) {
    return await openTestProject(path, app, { runtimeOptions, compile })
  }
  await Artifacts.mkdir(Artifacts.resolvePath('tmp', 'app-tests'), { recursive: true })
  const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'app-tests', 'app-'))
  Artifacts.trackTemporary(directory)
  return createWorkspace({ outputDirectory: directory, runtimeOptions, compile })
}

async function openTestProject(
  path: string,
  app: string,
  options: Parameters<typeof openProjectWorkspace>[1],
) {
  const prefix = `test-${Platform.hashText(`${Path.resolve(path)}:${app}`).slice(0, 16)}`
  for (let slot = 0; slot < 16; slot++) {
    const id = `${prefix}-${slot}`
    const workspace = await Try(() => openProjectWorkspace(path, { ...options, id }), {
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

function browser(state: Session): TestBrowser {
  return state.browser ?? Errors.ThrowUnexpected('Run an app before interacting with it.')
}

async function disposeSession(state: Session): Promise<void> {
  await Try(async () => {
    await state.browser?.dispose()
  }, {
    async finally() {
      await Try(async () => {
        await state.expo?.dispose()
      }, {
        async finally() {
          await Try(() => retainExpoOutput(state), { finally: () => state.workspace?.dispose() })
        },
      })
    },
  })
}

async function retainExpoOutput(state: Session): Promise<void> {
  if (state.expo && state.workspace?.runtime) {
    const output = await state.expo.output()
    await FileSystem.writeFile(
      Path.join(state.workspace.runtime.directory, 'expo.log'),
      [output.stdout, output.stderr].join('\n'),
    )
  }
}
