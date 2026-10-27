import { IO, runCommand } from '@cli-kit'
import { createTypeScriptFormatter } from '@fix/lib/formatter/Embedded'
import { Try } from '@shared'
import { Artifacts, Bundle, FileSystem, FormatterResources, Path, Platform, Repo } from '@shared/os'
import { readLicense } from '../../../../4-fix/fix-src/lib/formatter/Bridge_dprint-formatter/Bridge_dprint-formatter-resources'
import * as JavaScriptGrammar from '../../../../ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_tree-sitter-javascript'
import * as TypeScriptGrammar from '../../../../ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_tree-sitter-typescript'
import * as WebTreeSitter from '../../../../ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_web-tree-sitter'
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
    WebTreeSitter.resolveWasmResource(modulesDirectory),
    Path.join(packageRoot, 'runtime/web-tree-sitter.wasm'),
  )
  await FileSystem.cp(
    TypeScriptGrammar.resolveResources(modulesDirectory).grammar,
    Path.join(packageRoot, 'grammars/tree-sitter-tsx.wasm'),
  )
  await FileSystem.mkdir(Path.join(packageRoot, 'queries'), { recursive: true })
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
  const grammar = TypeScriptGrammar.resolveResources(modulesDirectory)
  const notices = [
    'web-tree-sitter\n\n' + await FileSystem.readFile(WebTreeSitter.resolveLicenseResource(modulesDirectory), 'utf8'),
    'tree-sitter-typescript\n\n' + await FileSystem.readFile(grammar.license, 'utf8'),
  ]
  await FileSystem.writeFile(
    Path.join(packageRoot, 'THIRD_PARTY_LICENSES.txt'),
    [...notices, formatterNotice].join('\n\n'),
  )
}

async function copyFormatter(): Promise<string> {
  const bytes = await FormatterResources.typeScriptFormatterBytes()
  await FileSystem.writeFile(Path.join(packageRoot, 'runtime/typescript-formatter.wasm'), bytes)
  const wrapperLicense = await readLicense(Repo.resolvePath('ts/4-fix'))
  return `@dprint/formatter\n\n${wrapperLicense}\n\n@dprint/typescript\n\n${createTypeScriptFormatter(bytes).license}`
}

async function copyLanguageIcons(): Promise<void> {
  const icons = Repo.resolvePath('Assets/Icons')
  await FileSystem.mkdir(Path.join(packageRoot, 'icons'), { recursive: true })
  await FileSystem.cp(Path.join(icons, 'tao-light.svg'), Path.join(packageRoot, 'icons/tao-light.svg'))
  await FileSystem.cp(Path.join(icons, 'tao-dark.svg'), Path.join(packageRoot, 'icons/tao-dark.svg'))
}

async function writeTsxQueries(modulesDirectory: string): Promise<void> {
  const typescript = TypeScriptGrammar.resolveResources(modulesDirectory)
  const javascript = JavaScriptGrammar.resolveResources(typescript.directory)
  const paths = [...javascript.queries, typescript.query]
  const queries = await Promise.all(paths.map(path => FileSystem.readFile(path, 'utf8')))
  await FileSystem.writeFile(Path.join(packageRoot, 'queries/tsx-highlights.scm'), queries.join('\n'))
  await FileSystem.cp(javascript.license, Path.join(packageRoot, 'JAVASCRIPT_LICENSE.txt'))
}
