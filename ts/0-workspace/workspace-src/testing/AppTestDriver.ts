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
): Promise<TestDriver> {
  const state: Session = {}
  return {
    async run(app) {
      await Artifacts.mkdir(Artifacts.resolvePath('tmp', 'app-tests'), { recursive: true })
      const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'app-tests', 'app-'))
      Artifacts.trackTemporary(directory)
      state.workspace = createWorkspace({
        outputDirectory: directory,
        onProgress,
        runtimeOptions: { toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains') },
        compile: (input, options, timings) => compileApp(input, { ...options, app }, timings),
      })
      onProgress?.('Compiling and publishing the Tao app…')
      const result = await state.workspace.update(new Document(path, source))
      onProgress?.('Tao app compilation and publication finished.')
      for (const timing of result.timings) {
        onProgress?.(`Pipeline phase ${timing.name}: ${timing.durationMs.toFixed(2)}ms.`)
      }
      if (result.status !== 'published') {
        Errors.ThrowUserInput(result.status === 'failed' ? result.error : `App test compilation was ${result.status}.`)
      }
      onProgress?.('Starting headless Expo runtime and waiting for readiness…')
      state.expo = await Runtime.start(state.workspace.runtime!, undefined, onProgress)
      onProgress?.('Headless Expo runtime ready.')
      onProgress?.('Launching headless browser…')
      state.browser = await openBrowser()
      onProgress?.('Headless browser ready.')
      onProgress?.('Navigating to app and waiting for initial readiness…')
      await state.browser.open(state.expo.url)
      onProgress?.('App navigation and initial readiness complete.')
    },
    press: tag => browser(state).press(tag),
    type: (tag, value) => browser(state).type(tag, value),
    expectText: (value, tag) => browser(state).expectText(value, tag),
    expectInput: (tag, value) => browser(state).expectInput(tag, value),
    async dispose() {
      onProgress?.('Cleaning up headless browser, Expo runtime and workspace…')
      await disposeSession(state)
      onProgress?.('Test case cleanup complete.')
    },
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
