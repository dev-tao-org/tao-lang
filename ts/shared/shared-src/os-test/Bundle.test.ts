import { Try } from '@shared'
import { Artifacts, Bundle, FileSystem, Path, Platform, Tests } from '@shared/os'

Tests.test('runtime bundling consumes the captured source after an edit and revert', async () => {
  const root = Artifacts.resolvePath('tmp', `runtime-snapshot-${Platform.randomUUID()}`)
  await Try(() => verifyCapturedBundle(root), {
    finally() {
      return FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

async function verifyCapturedBundle(root: string): Promise<void> {
  const entry = Path.join(root, 'Entry.ts')
  const value = Path.join(root, 'Value.ts')
  const output = Path.join(root, 'output')
  const sources = {
    [entry]: "export { value } from '@fixture'",
    [value]: 'export const value = "captured-A"',
    [Path.join(root, 'tsconfig.json')]: JSON.stringify({
      compilerOptions: { paths: { '@fixture': ['./Value.ts'] } },
    }),
  }
  await FileSystem.mkdir(root, { recursive: true })
  for (const [path, content] of Object.entries(sources)) {
    await FileSystem.writeFile(path, content)
  }
  await FileSystem.writeFile(value, 'export const value = "intervening-B"')
  await Bundle.bundleRuntime([entry], output, { root, sources })
  await FileSystem.writeFile(value, sources[value]!)
  const bundled = await FileSystem.readFile(Path.join(output, 'Entry.js'), 'utf8')
  Tests.expect(bundled).toContain('captured-A')
  Tests.expect(bundled).not.toContain('intervening-B')
}
