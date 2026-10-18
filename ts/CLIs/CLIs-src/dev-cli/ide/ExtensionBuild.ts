import { IO, runCommand } from '@cli-kit'
import { Try } from '@shared'
import { Artifacts, Bundle, FileSystem, Path, Platform, Repo } from '@shared/os'
import { prepareParser } from '../../cli-checks/parser-build'

/** buildExtension packages the current Tao grammar and editor adapter into one standalone VSIX. */
export async function buildExtension(): Promise<string> {
  await prepareExtensionAssets()
  await Bundle.bundleNode(Path.join(sourceRoot, 'ide-extension-src/extension.ts'), Path.join(packageRoot, 'dist'), [
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
  await FileSystem.mkdir(Path.join(packageRoot, 'grammars'), { recursive: true })
  await FileSystem.mkdir(Path.join(packageRoot, 'runtime'), { recursive: true })
  await runCommand('tree-sitter build --wasm --output', {
    variadicArgs: [
      Path.join(packageRoot, 'grammars/tree-sitter-tao.wasm'),
      Repo.resolvePath('ts/1-grammar/_gen_parser'),
    ],
    cwd: Repo.resolvePath('ts'),
  })
  await copyAssets()
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(sourceRoot, 'package.json'), 'utf8'))
  delete manifest.dependencies
  delete manifest.devDependencies
  delete manifest.private
  await FileSystem.writeFile(
    Path.join(packageRoot, 'package.json'),
    JSON.stringify(
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
    ),
  )
}

const sourceRoot = Repo.resolvePath('ts/ide-extension')
const packageRoot = Repo.resolvePath('.artifacts/ide-extension/package')
const vsixPath = Repo.resolvePath('.artifacts/ide-extension/tao-language.vsix')

async function validateRelocatedPackage(): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `editor-package-${Platform.randomUUID()}`)
  await Try(async () => {
    await FileSystem.cp(packageRoot, directory, { recursive: true })
    await Bundle.validateEditorBundle(Path.join(directory, 'dist/extension.js'))
  }, {
    finally() {
      return FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
}

async function copyAssets(): Promise<void> {
  const modules = Path.join(sourceRoot, 'node_modules')
  await FileSystem.cp(
    Path.join(modules, 'web-tree-sitter/web-tree-sitter.wasm'),
    Path.join(packageRoot, 'runtime/web-tree-sitter.wasm'),
  )
  await FileSystem.cp(
    Path.join(modules, 'tree-sitter-typescript/tree-sitter-tsx.wasm'),
    Path.join(packageRoot, 'grammars/tree-sitter-tsx.wasm'),
  )
  await FileSystem.mkdir(Path.join(packageRoot, 'queries'), { recursive: true })
  await FileSystem.cp(
    Repo.resolvePath('ts/1-grammar/grammar-src/queries/highlights.scm'),
    Path.join(packageRoot, 'queries/tao-highlights.scm'),
  )
  await writeTsxQueries(modules)
  await FileSystem.cp(Repo.resolvePath('LICENSE'), Path.join(packageRoot, 'LICENSE'))
  await FileSystem.cp(Path.join(sourceRoot, 'README.md'), Path.join(packageRoot, 'README.md'))
  await FileSystem.cp(
    Path.join(sourceRoot, 'language-configuration.json'),
    Path.join(packageRoot, 'language-configuration.json'),
  )
  const notices = await Promise.all(
    ['web-tree-sitter', 'tree-sitter-typescript'].map(async name =>
      `${name}\n\n${await FileSystem.readFile(Path.join(modules, name, 'LICENSE'), 'utf8')}`
    ),
  )
  await FileSystem.writeFile(Path.join(packageRoot, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n\n'))
}

async function writeTsxQueries(modules: string): Promise<void> {
  const typescript = FileSystem.realpathSync(Path.join(modules, 'tree-sitter-typescript'))
  const javascript = Path.join(Path.dirname(typescript), 'tree-sitter-javascript')
  const paths = [
    Path.join(javascript, 'queries/highlights.scm'),
    Path.join(javascript, 'queries/highlights-jsx.scm'),
    Path.join(typescript, 'queries/highlights.scm'),
  ]
  const queries = await Promise.all(paths.map(path => FileSystem.readFile(path, 'utf8')))
  await FileSystem.writeFile(Path.join(packageRoot, 'queries/tsx-highlights.scm'), queries.join('\n'))
  await FileSystem.cp(Path.join(javascript, 'LICENSE'), Path.join(packageRoot, 'JAVASCRIPT_LICENSE.txt'))
}
