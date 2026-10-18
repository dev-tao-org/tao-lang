import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { updateTaoSource } from '../source/TaoSource'

Tests.test('source commands organize imports, format valid declarations and preserve invalid input on failed fixes', async () => {
  const directory = Artifacts.resolvePath('tmp', `source-tools-${Platform.randomUUID()}`)
  await FileSystem.mkdir(directory, { recursive: true })
  const path = Path.join(directory, 'Example.tao')
  await Try(() => runSourceCommands(path), {
    finally: () => FileSystem.rm(directory, { recursive: true, force: true }),
  })
})

async function runSourceCommands(path: string): Promise<void> {
  const messages: string[] = []
  const warnings: string[] = []
  const print = (message: string) => {
    messages.push(message)
  }
  await FileSystem.writeFile(path, 'use Text from @tao/ui\nuse Col from @tao/ui\nview Main{render Text( "Hi" )}')
  await updateTaoSource(path, 'fix', print, message => warnings.push(message))
  Tests.expect(await FileSystem.readFile(path, 'utf8'))
    .toBe('use Col, Text from @tao/ui\n\nview Main {\n  render Text("Hi")\n}')
  Tests.expect(warnings).toEqual([
    `${path}:1:5 [unused-import] Imported name 'Col' is not used in this file.`,
    `${path}:3:6 [unused-declaration] Declaration 'Main' is not used in this file.`,
  ])
  const invalid = 'view Main{render Text( "Hi" )}\n\nview Editing('
  await FileSystem.writeFile(path, invalid)
  await Tests.expect(updateTaoSource(path, 'fix', print)).rejects.toThrow('complete Tao document')
  Tests.expect(await FileSystem.readFile(path, 'utf8')).toBe(invalid)
  await updateTaoSource(path, 'format', print)
  Tests.expect(await FileSystem.readFile(path, 'utf8'))
    .toBe('view Main {\n  render Text("Hi")\n}\n\nview Editing(')
  await FileSystem.writeFile(path, 'view Native{render inject ```ts const n=1;return <Text value={ n } /> ```}')
  await updateTaoSource(path, 'format', print)
  Tests.expect(await FileSystem.readFile(path, 'utf8')).toBe(
    'view Native {\n  render inject ```ts\n    const n = 1\n    return <Text value={n} />\n  ```\n}',
  )
  Tests.expect(messages).toHaveLength(3)
  Tests.expect(warnings).toHaveLength(2)
}
