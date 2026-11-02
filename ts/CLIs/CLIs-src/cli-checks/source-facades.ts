import { Path } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import * as Bridges from './source-bridges'

/** SourceFacadeContext caches named module boundaries and module resolution for one check. */
export type SourceFacadeContext = {
  root: string
  facades: ReadonlyMap<string, ModuleFacade>
  publicEntries: ReadonlySet<string>
  options: TypeScript.CompilerOptions
  resolution: TypeScript.ModuleResolutionCache
}

/** createSourceFacadeContext discovers sibling Name.ts and Name/ implementation boundaries.
 *  Namespace exports and exact configured entry points publish independently importable sub-APIs. */
export function createSourceFacadeContext(
  root: string,
  filenames: readonly string[],
  options: TypeScript.CompilerOptions,
): SourceFacadeContext {
  const files = filenames.map(normalizePath)
  const directories = collectSourceDirectories(files, root)
  const facades = new Map<string, ModuleFacade>()
  for (const filename of files) {
    const directory = filename.replace(/\.tsx?$/u, '')
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
  }
}

/** sourceFacadeIssue rejects imports that bypass a named module's public facade. */
export function sourceFacadeIssue(
  node: TypeScript.Node,
  context: SourceFacadeContext,
  loaderAliases: Bridges.SourceLoaderAliases,
): string | undefined {
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

type ModuleFacade = { filename: string; directory: string }
type PublicNamespaceExport = TypeScript.ExportDeclaration & { moduleSpecifier: TypeScript.StringLiteral }

// Platform/package bridges are independently consumed entry points; importing os.ts would eagerly load unrelated hosts.
const independentSubtrees = ['ts/shared/shared-src/os/bridges']

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
  return independentSubtrees.some(directory => isInside(filename, normalizePath(Path.join(context.root, directory))))
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

function isPublicNamespaceExport(
  node: TypeScript.Statement,
): node is PublicNamespaceExport {
  return TypeScript.isExportDeclaration(node) && node.exportClause !== undefined
    && TypeScript.isNamespaceExport(node.exportClause) && node.moduleSpecifier !== undefined
    && TypeScript.isStringLiteral(node.moduleSpecifier)
}

function mayAccessImplementation(importer: string, owner: ModuleFacade): boolean {
  // Exact sibling test folders belong to this module; arbitrary test files do not bypass its boundary.
  return importer === owner.filename || isInside(importer, owner.directory)
    || isInside(importer, owner.directory + '-test')
}

function findNearestFacade(filename: string, context: SourceFacadeContext): ModuleFacade | undefined {
  let owner: ModuleFacade | undefined
  for (const candidate of context.facades.values()) {
    if (
      isInside(filename, candidate.directory)
      && (owner === undefined || candidate.directory.length > owner.directory.length)
    ) {
      owner = candidate
    }
  }
  return owner
}

function isInside(filename: string, directory: string): boolean {
  return filename.startsWith(directory + '/')
}

function normalizePath(filename: string): string {
  return filename.replaceAll('\\', '/')
}
