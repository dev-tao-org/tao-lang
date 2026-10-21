import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import { fixSourceConformance } from '../cli-checks/source-conformance-fix'

Tests.test('source fixing > applies nested optional reads, retains assertion optionality and leaves unsafe cases intact', async () => {
  await Artifacts.mkdir(Artifacts.resolvePath('tmp'), { recursive: true })
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'tao-source-fix-'))
  await Try(async () => {
    const path = Path.join(root, 'ts/example.ts')
    await FileSystem.write(
      path,
      declarations + S`
        node ? node.text as 'label' : undefined
        node ? (node.text as 'label') : undefined
        node ? node[(key ? key.text : undefined) ?? 'text'] : undefined
        scalar ? scalar.length : undefined
        node ? /* keep this explanation */ node.text : undefined
      `,
    )
    const expected = declarations + S`
      node?.text as 'label' | undefined
      (node?.text as 'label' | undefined)
      node?.[(key?.text) ?? 'text']
      scalar ? scalar.length : undefined
      node ? /* keep this explanation */ node.text : undefined
    `
    await fixSourceConformance(root)
    Tests.expect(await FileSystem.readFile(path, 'utf8')).toBe(expected)
    await fixSourceConformance(root)
    Tests.expect(await FileSystem.readFile(path, 'utf8')).toBe(expected)
    const legacy = Path.join(root, '.x-tao-old-v1/ignored.ts')
    await FileSystem.write(legacy, 'node ? node.text : undefined')
    await fixSourceConformance(root)
    Tests.expect(await FileSystem.readFile(legacy, 'utf8')).toBe('node ? node.text : undefined')
  }, {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})

const declarations = S`
  declare const node: { text: string } | null
  declare const key: { text: 'text' } | undefined
  declare const scalar: string | undefined
` + '\n'
