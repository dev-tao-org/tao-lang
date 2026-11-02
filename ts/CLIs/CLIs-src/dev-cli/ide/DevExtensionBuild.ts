import { IO, runNonInteractiveCommand } from '@cli-kit'
import { Bundle, FileSystem, Path, Repo } from '@shared/os'

/** buildDevExtension packages repository review commands as a separate developer extension. */
export async function buildDevExtension(): Promise<string> {
  const source = Repo.resolvePath('ts/ide-extensions/dev-tao-org')
  const output = Repo.resolvePath('.artifacts/ide-extensions/dev-tao-org/package')
  const vsix = Repo.resolvePath('.artifacts/ide-extensions/dev-tao-org/dev-tao-org.vsix')
  await FileSystem.mkdir(output)
  await Bundle.bundleNode(Path.join(source, 'dev-tao-org-src/extension.ts'), Path.join(output, 'dist'), ['vscode'])
  await Bundle.validateEditorBundle(Path.join(output, 'dist/extension.js'))
  const manifest = await FileSystem.readFile(Path.join(source, 'package.json'), 'utf8')
  await FileSystem.writeFile(
    Path.join(output, 'package.json'),
    formatPublishedDevManifest(manifest),
  )
  await FileSystem.cp(Path.join(source, 'README.md'), Path.join(output, 'README.md'))
  await FileSystem.cp(Repo.resolvePath('LICENSE'), Path.join(output, 'LICENSE'))
  await runNonInteractiveCommand('vsce package --no-dependencies --allow-missing-repository --out', {
    variadicArgs: [vsix],
    cwd: output,
  })
  IO.print(vsix)
  return vsix
}

type DevExtensionManifest = Record<string, unknown>

function formatPublishedDevManifest(contents: string): string {
  const manifest = JSON.parse(contents) as DevExtensionManifest
  delete manifest.private
  delete manifest.devDependencies
  return JSON.stringify(
    {
      ...manifest,
      name: 'dev-tao-org',
      publisher: 'devtao',
      type: 'commonjs',
      main: './dist/extension.js',
    },
    null,
    2,
  )
}
