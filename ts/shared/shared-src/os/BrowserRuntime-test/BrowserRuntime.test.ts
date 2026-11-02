import { Try } from '@shared'
import { FileSystem, HeadlessBrowser, Path, Tests } from '@shared/os'
import { TypeScript } from '../../bridges/Bridge_typescript'

Tests.test('browser runtime > standalone ES modules preserve the native fetch receiver', async () => {
  const [bridge, runtime] = await Promise.all([
    readBrowserModule('../bridges/Bridge_browser/Bridge_browser.ts'),
    readBrowserModule('../BrowserRuntime.ts'),
  ])
  const browser = await HeadlessBrowser.launch('test BrowserRuntime.test.ts', { handleSignals: false })
  await Try(async () => {
    const page = await browser.newPage()
    const result = await page.evaluate(async ({ bridge, runtime }) => {
      const bridgeUrl = URL.createObjectURL(new Blob([bridge], { type: 'text/javascript' }))
      const source = runtime.replace('./bridges/Bridge_browser/Bridge_browser', bridgeUrl)
      const runtimeUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
      const api = await import(runtimeUrl)
      return await api.requestJson('data:application/json,{"message":"ready"}')
    }, { bridge, runtime })
    Tests.expect(result).toEqual({ message: 'ready' })
  }, { finally: () => browser.close() })
})

async function readBrowserModule(relative: string): Promise<string> {
  const directory = Path.dirname(Path.fileURLToPath(import.meta.url))
  const source = await FileSystem.readFile(Path.resolve(directory, relative), 'utf8')
  return TypeScript.transpileModule(source, {
    compilerOptions: { target: TypeScript.ScriptTarget.ESNext, module: TypeScript.ModuleKind.ESNext },
  }).outputText
}
