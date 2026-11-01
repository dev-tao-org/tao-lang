import { IO, runCommand } from '@cli-kit'
import { createTypeScriptFormatter } from '@fix/lib/formatter/Embedded'
import { Errors, joinTextLines, Try } from '@shared'
import { Artifacts, Bundle, FileSystem, FormatterResources, Path, Platform, Repo } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'

/** buildExtension packages the current Tao grammar and editor adapter into one standalone VSIX. */
export async function buildExtension(): Promise<string> {
  await prepareExtensionAssets()
  await Bundle.bundleNode(Path.join(sourceRoot, 'tao-ide-extension-src/extension.ts'), Path.join(packageRoot, 'dist'), [
    'vscode',
  ])
  await validateRelocatedPackage()
  await runCommand('vsce package --no-dependencies --allow-missing-repository --out', {
    variadicArgs: [vsixPath],
    cwd: packageRoot,
  })
  IO.print(vsixPath)
  return vsixPath
}

/** prepareExtensionAssets generates the Tao WASM parser and stages the extension's portable assets. */
export async function prepareExtensionAssets(): Promise<void> {
  await prepareParser()
  await FileSystem.mkdirs(Path.join(packageRoot, 'grammars'), Path.join(packageRoot, 'runtime'))
  await runCommand('tree-sitter build --wasm --output', {
    variadicArgs: [
      Path.join(packageRoot, 'grammars/tree-sitter-tao.wasm'),
      Repo.resolvePath('ts/1-grammar/_gen_parser'),
    ],
    cwd: Repo.resolvePath('ts'),
  })
  await copyAssets()
  const manifest = await FileSystem.readFile(Path.join(sourceRoot, 'package.json'), 'utf8')
  await FileSystem.writeFile(Path.join(packageRoot, 'package.json'), formatPublishedExtensionManifest(manifest))
}

type ExtensionManifest = Record<string, unknown> & { files: string[] }

function formatPublishedExtensionManifest(contents: string): string {
  const manifest = JSON.parse(contents) as ExtensionManifest
  delete manifest.dependencies
  delete manifest.devDependencies
  delete manifest.private
  return JSON.stringify(
    {
      ...manifest,
      name: 'tao',
      publisher: 'devtao',
      type: 'commonjs',
      main: './dist/extension.js',
      files: [...manifest.files, 'LICENSE', 'THIRD_PARTY_LICENSES.txt', 'JAVASCRIPT_LICENSE.txt'],
    },
    null,
    2,
  )
}

const sourceRoot = Repo.resolvePath('ts/ide-extensions/tao-ide-extension')
const packageRoot = Repo.resolvePath('.artifacts/ide-extension/package')
const vsixPath = Repo.resolvePath('.artifacts/ide-extension/tao-language.vsix')

async function validateRelocatedPackage(): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `editor-package-${Platform.randomUUID()}`)
  await Try(async () => {
    await FileSystem.cp(packageRoot, directory, { recursive: true })
    await Bundle.validateEditorBundle(Path.join(directory, 'dist/extension.js'))
  }, {
    finally: () => FileSystem.rm(directory, { recursive: true, force: true }),
  })
}

async function copyAssets(): Promise<void> {
  const modulesDirectory = Path.join(sourceRoot, 'node_modules')
  await FileSystem.cp(
    Path.join(modulesDirectory, 'web-tree-sitter/web-tree-sitter.wasm'),
    Path.join(packageRoot, 'runtime/web-tree-sitter.wasm'),
  )
  await FileSystem.cp(
    Path.join(modulesDirectory, 'tree-sitter-typescript/tree-sitter-tsx.wasm'),
    Path.join(packageRoot, 'grammars/tree-sitter-tsx.wasm'),
  )
  await FileSystem.mkdir(Path.join(packageRoot, 'queries'))
  await FileSystem.cp(
    Repo.resolvePath('ts/1-grammar/grammar-src/queries/highlights.scm'),
    Path.join(packageRoot, 'queries/tao-highlights.scm'),
  )
  await writeTsxQueries(modulesDirectory)
  await FileSystem.cp(Repo.resolvePath('LICENSE'), Path.join(packageRoot, 'LICENSE'))
  await FileSystem.cp(Path.join(sourceRoot, 'README.md'), Path.join(packageRoot, 'README.md'))
  await FileSystem.cp(
    Path.join(sourceRoot, 'language-configuration.json'),
    Path.join(packageRoot, 'language-configuration.json'),
  )
  await copyLanguageIcons()
  const formatterNotice = await copyFormatter()
  const notices = await Promise.all(
    ['web-tree-sitter', 'tree-sitter-typescript'].map(async name =>
      `${name}\n\n${await FileSystem.readFile(Path.join(modulesDirectory, name, 'LICENSE'), 'utf8')}`
    ),
  )
  await FileSystem.writeFile(
    Path.join(packageRoot, 'THIRD_PARTY_LICENSES.txt'),
    [...notices, formatterNotice].join('\n\n'),
  )
}

async function copyFormatter(): Promise<string> {
  const bytes = await FormatterResources.typeScriptFormatterBytes()
  await FileSystem.writeFile(Path.join(packageRoot, 'runtime/typescript-formatter.wasm'), bytes)
  const formatterPackage = FileSystem.resolvePackageDirectory('@dprint/formatter', Repo.resolvePath('ts/4-fix'))
  if (!formatterPackage) {
    Errors.ThrowHostEnvironment('Cannot locate the installed @dprint/formatter package for extension licensing.')
  }
  const wrapperLicense = await FileSystem.readFile(Path.join(formatterPackage, 'LICENSE'), 'utf8')
  return joinTextLines(
    '@dprint/formatter',
    '',
    wrapperLicense,
    '',
    '@dprint/typescript',
    '',
    createTypeScriptFormatter(bytes).license,
  )
}

async function copyLanguageIcons(): Promise<void> {
  const icons = Repo.resolvePath('Assets/Icons')
  await FileSystem.mkdir(Path.join(packageRoot, 'icons'))
  await FileSystem.cp(Path.join(icons, 'tao-light.svg'), Path.join(packageRoot, 'icons/tao-light.svg'))
  await FileSystem.cp(Path.join(icons, 'tao-dark.svg'), Path.join(packageRoot, 'icons/tao-dark.svg'))
}

async function writeTsxQueries(modulesDirectory: string): Promise<void> {
  const typescriptDirectory = FileSystem.realpathSync(Path.join(modulesDirectory, 'tree-sitter-typescript'))
  const javascriptDirectory = Path.join(Path.dirname(typescriptDirectory), 'tree-sitter-javascript')
  const paths = [
    Path.join(javascriptDirectory, 'queries/highlights.scm'),
    Path.join(javascriptDirectory, 'queries/highlights-jsx.scm'),
    Path.join(typescriptDirectory, 'queries/highlights.scm'),
  ]
  const queries = await Promise.all(paths.map(path => FileSystem.readFile(path, 'utf8')))
  await FileSystem.writeFile(Path.join(packageRoot, 'queries/tsx-highlights.scm'), queries.join('\n'))
  await FileSystem.cp(Path.join(javascriptDirectory, 'LICENSE'), Path.join(packageRoot, 'JAVASCRIPT_LICENSE.txt'))
}
