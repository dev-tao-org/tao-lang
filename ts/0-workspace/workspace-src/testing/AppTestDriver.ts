import * as AST from '@ast-gen/AST'
import type { compile } from '@compile/Compile'
import * as Runtime from '@runtime/Runtime'
import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Path } from '@shared/os'
import { Document } from '../Document'
import { createWorkspace } from '../Workspace'
import type { TestBrowser } from './AppTests'
import type { TestDriver } from './RunTests'

/** createAppTestDriver owns the compiler, Expo and browser lifetime of one app test. */
export async function createAppTestDriver(
  path: string,
  source: string,
  document: AST.Document,
  openBrowser: () => Promise<TestBrowser>,
  compileApp: typeof compile,
): Promise<TestDriver> {
  const state: Session = {}
  return {
    async run(app) {
      if (!document.root.declarations.some(value => AST.IsAppDeclaration(value) && value.name.value === app)) {
        Errors.ThrowUserInput(`Unknown Tao app: ${app}.`)
      }
      await Artifacts.mkdir(Artifacts.resolvePath('tmp', 'app-tests'), { recursive: true })
      const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'app-tests', 'app-'))
      Artifacts.trackTemporary(directory)
      state.workspace = createWorkspace({
        outputDirectory: directory,
        runtimeOptions: { toolchainCacheDirectory: Artifacts.resolvePath('cache/runtime-toolchains') },
        compile: (input, options, timings) => compileApp(input, { ...options, app }, timings),
      })
      const result = await state.workspace.update(new Document(path, source))
      if (result.status !== 'published') {
        Errors.ThrowUserInput(`App test compilation was ${result.status}.`)
      }
      state.expo = await Runtime.start(state.workspace.runtime!)
      state.browser = await openBrowser()
      await state.browser.open(state.expo.url)
    },
    press: tag => browser(state).press(tag),
    type: (tag, value) => browser(state).type(tag, value),
    expectText: (value, tag) => browser(state).expectText(value, tag),
    expectInput: (tag, value) => browser(state).expectInput(tag, value),
    dispose: () => disposeSession(state),
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
