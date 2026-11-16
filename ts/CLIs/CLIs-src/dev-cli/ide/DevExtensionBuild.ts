import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import { Json } from '@shared'
import { Bundle, FS, Path, Repo } from '@shared/os'

/** buildDevExtension packages repository review commands as a separate developer extension. */
export async function buildDevExtension(): Promise<string> {
  const source = Repo.resolvePath('ts/ide-extensions/dev-tao-org')
  const output = Repo.resolvePath('.artifacts/ide-extensions/dev-tao-org/package')
  const vsix = Repo.resolvePath('.artifacts/ide-extensions/dev-tao-org/dev-tao-org.vsix')
  await FS.mkdir(output)
  await Bundle.bundleNode(Path.join(source, 'dev-tao-org-src/extension.ts'), Path.join(output, 'dist'), ['vscode'])
  await Bundle.validateEditorBundle(Path.join(output, 'dist/extension.js'))
  const manifest = await FS.readFile(Path.join(source, 'package.json'), 'utf8')
  await FS.writeFile(
    Path.join(output, 'package.json'),
    formatPublishedDevManifest(manifest),
  )
  await FS.cp(Path.join(source, 'README.md'), Path.join(output, 'README.md'))
  await FS.cp(Repo.resolvePath('LICENSE'), Path.join(output, 'LICENSE'))
  await CLIKit.runNonInteractiveCommand('vsce', [
    'package',
    '--no-dependencies',
    '--allow-missing-repository',
    '--out',
    vsix,
  ], {
    cwd: output,
  })
  IO.print(vsix)
  return vsix
}

type DevExtensionManifest = Record<string, unknown>

function formatPublishedDevManifest(contents: string): string {
  const manifest = Json.Parse(contents) as DevExtensionManifest
  delete manifest.private
  delete manifest.devDependencies
  return Json.Print({
    ...manifest,
    name: 'dev-tao-org',
    publisher: 'devtao',
    type: 'commonjs',
    main: './dist/extension.js',
  })
}
