import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, HeadlessBrowser, Path } from '@shared/os'
import { TypeScript } from '../../shared-src/bridges/Bridge_typescript'

Tests.test('standalone HTTP modules preserve the native fetch receiver', async () => {
  const [bridge, http] = await Promise.all([
    readBrowserModule('os/bridges/Bridge_browser/Bridge_browser.ts'),
    readBrowserModule('web/net/Http.ts'),
  ])
  const browser = await HeadlessBrowser.launch('test net.Http.test.ts', { handleSignals: false })
  await Try(async () => {
    const page = await browser.newPage()
    const result = await page.evaluate(async ({ bridge, http }) => {
      const bridgeUrl = URL.createObjectURL(new Blob([bridge], { type: 'text/javascript' }))
      const source = http.replace('../../os/bridges/Bridge_browser/Bridge_browser', bridgeUrl)
      const httpUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
      const api = await import(httpUrl)
      return await api.requestJson('data:application/json,{"message":"ready"}')
    }, { bridge, http })
    Tests.expect(result).toEqual({ message: 'ready' })
  }, { finally: () => browser.close() })
})

async function readBrowserModule(relative: string): Promise<string> {
  const directory = Path.resolve(Path.dirname(Path.fileURLToPath(import.meta.url)), '../../shared-src')
  const source = await FS.readFile(Path.resolve(directory, relative), 'utf8')
  return TypeScript.transpileModule(source, {
    compilerOptions: { target: TypeScript.ScriptTarget.ESNext, module: TypeScript.ModuleKind.ESNext },
  }).outputText
}
