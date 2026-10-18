import type { compile } from '@compile/Compile'
import * as Runtime from '@runtime/Runtime'
import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Path } from '@shared/os'
import { Document } from '../Document'
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
      await Artifacts.mkdir(Artifacts.resolvePath('tmp', 'app-tests'), { recursive: true })
      const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'app-tests', 'app-'))
      Artifacts.trackTemporary(directory)
      state.workspace = createWorkspace({
        outputDirectory: directory,
        runtimeOptions: { toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains') },
        compile: (input, options, timings) => compileApp(input, { ...options, app }, timings),
      })
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
  workspace?: ReturnType<typeof createWorkspace>
  expo?: Runtime.ExpoSession
  browser?: TestBrowser
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
          await state.workspace?.dispose()
          if (state.expo && state.workspace?.runtime) {
            const output = await state.expo.output()
            await FileSystem.writeFile(
              Path.join(state.workspace.runtime.directory, 'expo.log'),
              [output.stdout, output.stderr].join('\n'),
            )
          }
        },
      })
    },
  })
}
