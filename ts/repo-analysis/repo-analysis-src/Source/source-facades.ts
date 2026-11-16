import { Regxs } from '@shared'
import { Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import * as PackageApis from '../Workspace/PackageApis'
import * as Bridges from './source-bridges'

/** SourceFacadeContext caches named module boundaries and module resolution for one check. */
export type SourceFacadeContext = {
  root: string
  facades: ReadonlyMap<string, ModuleFacade>
  publicEntries: ReadonlySet<string>
  options: TypeScript.CompilerOptions
  resolution: TypeScript.ModuleResolutionCache
  namespaces: PackageApis.PackageImportRules
}

/** createSourceFacadeContext discovers sibling Name.ts and Name/ implementation boundaries.
 *  Namespace/default module exports and exact configured entry points publish independently importable sub-APIs. */
export function createSourceFacadeContext(
  root: string,
  filenames: readonly string[],
  options: TypeScript.CompilerOptions,
): SourceFacadeContext {
  const files = filenames.map(normalizePath)
  const directories = collectSourceDirectories(files, root)
  const facades = new Map<string, ModuleFacade>()
  for (const filename of files) {
    const directory = filename.replace(Regxs.TypeScriptSourceExtensionRegx, '')
    if (directories.has(directory)) {
      facades.set(filename, { filename, directory })
    }
  }
  const publicEntries = new Set([
    ...resolveConfiguredPublicEntries(root, options),
    ...collectNamespacePublicEntries(facades, options),
  ])
  const resolution = TypeScript.createModuleResolutionCache(root, normalizePath, options)
  return {
    root,
    facades,
    publicEntries,
    options,
    resolution,
    namespaces: PackageApis.readPackageImportRules(root),
  }
}

/** sourceFacadeIssue rejects imports that bypass a named module's public facade. */
export function sourceFacadeIssue(
  node: TypeScript.Node,
  context: SourceFacadeContext,
  loaderAliases: Bridges.SourceLoaderAliases,
): string | undefined {
  const issue = PackageApis.packageNamespaceIssue(node, context.namespaces)
  if (issue !== undefined) {
    return issue
  }
  const specifier = Bridges.sourceModuleSpecifier(node, loaderAliases)
  if (specifier === undefined) {
    return
  }
  const importer = normalizePath(node.getSourceFile().fileName)
  const resolved = TypeScript.resolveModuleName(
    specifier,
    importer,
    context.options,
    TypeScript.sys,
    context.resolution,
  )
  const target = resolved.resolvedModule?.resolvedFileName
  if (target === undefined) {
    return
  }
  const filename = normalizePath(target)
  if (isPrivatePackageImport(importer, filename, specifier, context)) {
    return 'cross-package imports must use an exact manifest-owned public entrypoint'
  }
  if (isPublicEntry(filename, context)) {
    return
  }
  const owner = findNearestFacade(filename, context)
  if (owner === undefined || mayAccessImplementation(importer, owner)) {
    return
  }
  const facade = normalizePath(Path.relative(context.root, owner.filename))
  return `import through ${facade} instead of its private implementation`
}

/** sourceFacadeLayoutIssue keeps sibling facade files limited to imports and re-exports. */
export function sourceFacadeLayoutIssue(
  file: TypeScript.SourceFile,
  context: SourceFacadeContext,
): string | undefined {
  if (!context.facades.has(normalizePath(file.fileName))) {
    return
  }
  if (file.statements.some(node => !TypeScript.isImportDeclaration(node) && !TypeScript.isExportDeclaration(node))) {
    return 'facade files contain only imports and re-exports; move implementation into the sibling folder'
  }
}

type OptionalModuleFacade = ModuleFacade | undefined
type OptionalModuleSpecifier = TypeScript.Expression | undefined

type ModuleFacade = { filename: string; directory: string }
type PublicNamespaceExport = TypeScript.ExportDeclaration & { moduleSpecifier: TypeScript.StringLiteral }

// Platform/package bridges are independently consumed entry points; importing os.ts would eagerly load unrelated hosts.
const independentSubtrees = ['ts/shared/shared-src/os/bridges', 'ts/shared/shared-src/os/Process/Process-Current.ts']

function collectSourceDirectories(files: readonly string[], root: string): Set<string> {
  const directories = new Set<string>()
  for (const filename of files) {
    let directory = normalizePath(Path.dirname(filename))
    while (isInside(directory, normalizePath(root))) {
      directories.add(directory)
      directory = normalizePath(Path.dirname(directory))
    }
  }
  return directories
}

function resolveConfiguredPublicEntries(root: string, options: TypeScript.CompilerOptions): Set<string> {
  const entries = new Set<string>()
  for (const [alias, targets] of Object.entries(options.paths ?? {})) {
    if (alias.includes('*')) {
      continue
    }
    for (const target of targets) {
      const resolved = TypeScript.resolveModuleName(alias, Path.join(root, 'ts/facade.ts'), options, TypeScript.sys)
      if (!target.includes('*') && resolved.resolvedModule) {
        entries.add(normalizePath(resolved.resolvedModule.resolvedFileName))
      }
    }
  }
  return entries
}

function isPublicEntry(filename: string, context: SourceFacadeContext): boolean {
  if (context.facades.has(filename) || context.publicEntries.has(filename)) {
    return true
  }
  return independentSubtrees.some(directory => {
    const entry = normalizePath(Path.join(context.root, directory))
    return filename === entry || isInside(filename, entry)
  })
}

function collectNamespacePublicEntries(
  facades: ReadonlyMap<string, ModuleFacade>,
  options: TypeScript.CompilerOptions,
): string[] {
  const entries: string[] = []
  for (const facade of facades.values()) {
    const source = TypeScript.sys.readFile(facade.filename)
    if (source === undefined) {
      continue
    }
    const file = TypeScript.createSourceFile(facade.filename, source, TypeScript.ScriptTarget.Latest)
    for (const node of file.statements) {
      if (!isPublicNamespaceExport(node)) {
        continue
      }
      const resolved = TypeScript.resolveModuleName(node.moduleSpecifier.text, facade.filename, options, TypeScript.sys)
      if (resolved.resolvedModule) {
        entries.push(normalizePath(resolved.resolvedModule.resolvedFileName))
      }
    }
  }
  return entries
}

function isPublicNamespaceExport(node: TypeScript.Statement): node is PublicNamespaceExport {
  if (!TypeScript.isExportDeclaration(node) || node.exportClause === undefined) {
    return false
  }
  return publishesModule(node.exportClause) && isLiteralModuleSpecifier(node.moduleSpecifier)
}

function publishesModule(clause: TypeScript.NamedExportBindings): boolean {
  if (TypeScript.isNamespaceExport(clause)) {
    return true
  }
  return clause.elements.some(element => element.propertyName?.text === 'default')
}

function isLiteralModuleSpecifier(node: OptionalModuleSpecifier): node is TypeScript.StringLiteral {
  return node !== undefined && TypeScript.isStringLiteral(node)
}

function mayAccessImplementation(importer: string, owner: ModuleFacade): boolean {
  // Mirrored central test folders belong to this module; unrelated tests use its facade.
  const testOwner = centralTestDirectory(owner.directory)
  return importer === owner.filename || isInside(importer, owner.directory) || isMirroredTestOwner(importer, testOwner)
}

function isMirroredTestOwner(importer: string, testOwner: string): boolean {
  if (!importer.startsWith(testOwner + '.')) {
    return false
  }
  const suffix = importer.slice(testOwner.length)
  const testModule = suffix.endsWith('.test.ts') || suffix.includes('.test-utils') || suffix.includes('.test-fixtures')
  return !suffix.includes('/') && testModule
}

function findNearestFacade(filename: string, context: SourceFacadeContext): ModuleFacade | undefined {
  let owner: OptionalModuleFacade
  for (const candidate of context.facades.values()) {
    if (isCloserFacade(filename, candidate, owner)) {
      owner = candidate
    }
  }
  return owner
}

function isCloserFacade(filename: string, candidate: ModuleFacade, owner: OptionalModuleFacade): boolean {
  return isInside(filename, candidate.directory)
    && (owner === undefined || candidate.directory.length > owner.directory.length)
}

function isInside(filename: string, directory: string): boolean {
  return filename.startsWith(directory + '/')
}

function normalizePath(filename: string): string {
  return filename.replaceAll('\\', '/')
}

function centralTestDirectory(directory: string): string {
  const segments = directory.split('/')
  const sourceIndex = segments.findIndex(segment => segment.endsWith('-src'))
  if (sourceIndex >= 0) {
    segments[sourceIndex] = 'test-' + segments[sourceIndex].slice(0, -4)
  }
  return segments.join('/')
}

function isPrivatePackageImport(
  importer: string,
  target: string,
  specifier: string,
  context: SourceFacadeContext,
): boolean {
  const sourcePackage = sourcePackageDirectory(importer, context.root)
  const targetPackage = sourcePackageDirectory(target, context.root)
  if (sourcePackage === undefined || targetPackage === undefined || sourcePackage === targetPackage) {
    return false
  }
  if (context.namespaces.has(specifier) || isPlatformToolBoundary(target, context.root)) {
    return false
  }
  return !isAliasRepairBoundary(importer, target, context.root)
}

function isAliasRepairBoundary(importer: string, target: string, root: string): boolean {
  // The fixer must load before any generated alias exists and Bun may retain the old configuration.
  const command = normalizePath(Path.relative(root, importer))
  if (command !== 'ts/CLIs/CLIs-src/dev-cli/commands/fix.ts') {
    return false
  }
  const module = normalizePath(Path.relative(root, target))
  return [
    'ts/repo-analysis/repo-analysis-src/Workspace/PackageApis.ts',
    'ts/repo-analysis/repo-analysis-src/Source/source-conformance-fix.ts',
  ].includes(module)
}

function sourcePackageDirectory(filename: string, root: string): string | undefined {
  const relative = normalizePath(Path.relative(Path.join(root, 'ts'), filename))
  const segments = relative.split('/')
  if (segments[0] === '..' || segments.length < 3 || segments.includes('node_modules')) {
    return
  }
  return segments[0] === 'ide-extensions' ? segments.slice(0, 2).join('/') : segments[0]
}

function isPlatformToolBoundary(filename: string, root: string): boolean {
  const relative = normalizePath(Path.relative(root, filename))
  const explicitFiles = [
    'ts/shared/shared-src/bridges/Bridge_typescript.ts',
    'ts/shared/shared-src/os/MetroPlatform.ts',
    'ts/shared/shared-src/os/preview/PreviewErrors.ts',
    'ts/shared/shared-src/os/Tooling/Bootstrap.ts',
    'ts/shared/shared-src/os/Process/Process-Current.ts',
    'ts/ide-extensions/bridges/Bridge_vscode.ts',
    'ts/4-fix/fix-src/lib/formatter/Bridge_dprint-formatter/Bridge_dprint-formatter-resources.ts',
    'ts/ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_tree-sitter-javascript.ts',
    'ts/ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_tree-sitter-typescript.ts',
    'ts/ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_web-tree-sitter.ts',
  ]
  return explicitFiles.includes(relative) || relative.startsWith('ts/shared/shared-src/os/bridges/')
}
