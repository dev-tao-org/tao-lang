import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { updateTaoSource } from '../../CLIs-src/dev-cli/source/TaoSource'

Tests.test('source commands organize imports, format valid declarations and preserve invalid input on failed fixes', async () => {
  const directory = Artifacts.resolvePath('tmp', `source-tools-${Platform.randomUUID()}`)
  await FS.mkdir(directory)
  const path = Path.join(directory, 'Example.tao')
  await Try(() => runSourceCommands(path), {
    finally: () => FS.rm(directory, { recursive: true, force: true }),
  })
})

async function runSourceCommands(path: string): Promise<void> {
  const messages: string[] = []
  const warnings: string[] = []
  const print = (message: string) => {
    messages.push(message)
  }
  await FS.writeFile(
    path,
    S`
      use tao@ui Text
      use tao@ui Col
      view Main{render Text( "Hi" )}
    `,
  )
  await updateTaoSource(path, 'fix', print, message => warnings.push(message))
  Tests.expect(await FS.readFile(path, 'utf8'))
    .toBe('use tao@ui Col, Text\n\nview Main {\n  render Text("Hi")\n}')
  Tests.expect(warnings).toEqual([
    `${path}:1:12 [unused-import] Imported name 'Col' is not used in this file.`,
    `${path}:3:6 [unused-declaration] Declaration 'Main' is not used in this file.`,
  ])
  const invalid = S`
    view Main{render Text( "Hi" )}

    view Editing(
  `
  await FS.writeFile(path, invalid)
  await Tests.expect(updateTaoSource(path, 'fix', print)).rejects.toThrow('complete Tao document')
  Tests.expect(await FS.readFile(path, 'utf8')).toBe(invalid)
  await updateTaoSource(path, 'format', print)
  Tests.expect(await FS.readFile(path, 'utf8'))
    .toBe('view Main {\n  render Text("Hi")\n}\n\nview Editing(')
  await FS.writeFile(path, 'view Native{render inject ```ts const n=1;return <Text value={ n } /> ```}')
  await updateTaoSource(path, 'format', print)
  Tests.expect(await FS.readFile(path, 'utf8')).toBe(
    'view Native {\n  render inject ```ts\n    const n = 1\n    return <Text value={n} />\n  ```\n}',
  )
  Tests.expect(messages).toHaveLength(3)
  Tests.expect(warnings).toHaveLength(2)
}
