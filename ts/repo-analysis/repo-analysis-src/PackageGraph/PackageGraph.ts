import { Json, NewlineCharacter, S, Schema, Sort, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { readWorkspaceManifestPaths } from '../Workspace/WorkspaceManifests'
import type { DependencyCruiser } from './Bridge_dependency-cruiser'
import { classifyModuleImports, type ImportKind } from './PackageGraph-ImportKinds'

type WorkspacePackage = { name: string; directory: string }
type ImportScope = 'source' | 'test'
type ImportLocation = { package: string; file: string }
type PackageImport = {
  from: ImportLocation
  to: ImportLocation
  specifier: string
  kind: ImportKind
  scope: ImportScope
}
type UnresolvedImport = { from: ImportLocation; specifier: string; kind: ImportKind; scope: ImportScope }
type PackageGraph = { packages: WorkspacePackage[]; imports: PackageImport[]; unresolved: UnresolvedImport[] }

const PackageManifestSchema = Schema.object({ name: Schema.string().min(1) })
const SourceExtensions = ['.ts', '.tsx', '.mts', '.cts']
const IgnoredFolders = ['**/node_modules/**', '**/_gen_*/**', '**/.tao/**']
const IgnoredPaths = '(^|/)(node_modules|_gen_[^/]+|[.]tao)(/|$)'

/** analyzePackageGraph resolves and classifies direct imports across workspace package boundaries. */
export async function analyzePackageGraph(workspace: string): Promise<PackageGraph> {
  const packages = await readWorkspacePackages(workspace)
  const entries = packages.flatMap(pkg => listPackageSources(workspace, pkg))
  const tsConfigPath = Path.join(workspace, 'tsconfig.base.json')
  const Bridge = await import('./Bridge_dependency-cruiser')
  const tsConfig = Bridge.extractTSConfig(tsConfigPath)
  const result = await Bridge.DependencyCruiser.cruise(
    entries,
    {
      baseDir: workspace,
      doNotFollow: { path: IgnoredPaths },
      exclude: { path: IgnoredPaths },
      enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
      tsConfig: { fileName: tsConfigPath },
      tsPreCompilationDeps: 'specify',
    },
    undefined,
    { tsConfig },
  )
  UserInput.Require(
    !(result.exitCode !== 0 || typeof result.output === 'string'),
    'Dependency-cruiser did not return an import graph.',
  )
  return collectPackageGraph(workspace, packages, result.output.modules)
}

/** serializePackageGraph retains the resolved file edges and unresolved specifiers for inspection. */
export function serializePackageGraph(graph: PackageGraph): string {
  return Json.Print(graph) + NewlineCharacter
}

/** renderPackageGraph renders separate source and test import diagrams in Markdown. */
export function renderPackageGraph(graph: PackageGraph): string {
  const source = renderImportDiagram(graph, 'source')
  const test = renderImportDiagram(graph, 'test')
  return S`
    # TypeScript workspace package imports

    Arrows point from the importer to the imported package. Edge labels count file imports by kind.
    Value imports can include tooling or platform-specific code. Type and compile-only imports describe
    relationships before TypeScript compilation. The accompanying JSON lists the resolved file pairs
    and unresolved specifiers.

    ## Source imports

    ${source}

    ## Test imports

    ${test}
  ` + NewlineCharacter
}

async function readWorkspacePackages(workspace: string): Promise<WorkspacePackage[]> {
  const manifests = readWorkspaceManifestPaths(workspace)
  const packages = await Promise.all(manifests.map(file => readWorkspacePackage(workspace, file)))
  return packages.sort(Sort.By(pkg => pkg.name, Sort.CompareStrings))
}

async function readWorkspacePackage(workspace: string, filename: string): Promise<WorkspacePackage> {
  const { name } = await FS.readJson(filename, { schema: PackageManifestSchema })
  const directory = Path.toPortablePath(Path.relative(workspace, Path.dirname(filename)))
  return { name, directory }
}

function listPackageSources(workspace: string, pkg: WorkspacePackage): string[] {
  const files = TypeScript.sys.readDirectory(Path.join(workspace, pkg.directory), SourceExtensions, IgnoredFolders)
  // Dependency-cruiser's baseDir expects relative input paths independently of the process cwd.
  return files.map(file => Path.relative(workspace, file))
}

type PackageDirectoryIndex = ReadonlyMap<string, WorkspacePackage>

function collectPackageGraph(
  workspace: string,
  packages: WorkspacePackage[],
  modules: DependencyCruiser.IModule[],
): PackageGraph {
  const owners = new Map(packages.map(pkg => [pkg.directory, pkg]))
  const imports: PackageImport[] = []
  const unresolved: UnresolvedImport[] = []
  const sortedModules = modules.toSorted(Sort.By(module => module.source, Sort.CompareStrings))
  for (const module of sortedModules) {
    const file = Path.toPortablePath(module.source)
    const owner = findPackageOwner(owners, file)
    if (!owner) {
      continue
    }
    const from = { package: owner.name, file }
    const scope = classifyImportScope(owner, file)
    for (const { dependency, kind } of classifyModuleImports(workspace, module)) {
      if (dependency.couldNotResolve) {
        unresolved.push({ from, specifier: dependency.module, kind, scope })
        continue
      }
      const toFile = Path.toPortablePath(dependency.resolved)
      const target = findPackageOwner(owners, toFile)
      if (target && target !== owner) {
        const to = { package: target.name, file: toFile }
        imports.push({ from, to, specifier: dependency.module, kind, scope })
      }
    }
  }
  return { packages, imports, unresolved }
}

function findPackageOwner(owners: PackageDirectoryIndex, file: string): WorkspacePackage | undefined {
  let directory = Path.posix.dirname(file)
  while (directory !== '.' && directory !== '/') {
    const owner = owners.get(directory)
    if (owner) {
      return owner
    }
    directory = Path.posix.dirname(directory)
  }
  return undefined
}

function classifyImportScope(owner: WorkspacePackage, file: string): ImportScope {
  const packagePath = file.slice(owner.directory.length + 1)
  const inTestFolder = Path.posix.dirname(packagePath).startsWith('test-')
  const testFile = SourceExtensions.some(extension => packagePath.endsWith(`.test${extension}`))
  return inTestFolder || testFile ? 'test' : 'source'
}

type ImportCounts = Record<ImportKind, number>
type PackageEdgeIndex = Map<string, Map<string, ImportCounts>>

const MarkdownFence = '```'

function renderImportDiagram(graph: PackageGraph, scope: ImportScope): string {
  const lines = [MarkdownFence + 'mermaid', 'flowchart LR']
  const packageIds = new Map(graph.packages.map((pkg, index) => [pkg.name, `p${index + 1}`]))
  const edges = countPackageEdges(graph.imports, scope)
  for (const [name, id] of packageIds) {
    if (scope === 'source' || participatesInEdges(edges, name)) {
      lines.push(`  ${id}["${name}"]`)
    }
  }
  for (const from of Sort.Strings(edges.keys())) {
    const destinations = edges.get(from)!
    for (const to of Sort.Strings(destinations.keys())) {
      const label = formatImportCounts(destinations.get(to)!)
      lines.push(`  ${packageIds.get(from)} -->|${label}| ${packageIds.get(to)}`)
    }
  }
  lines.push(MarkdownFence)
  return lines.join(NewlineCharacter)
}

function countPackageEdges(imports: readonly PackageImport[], scope: ImportScope): PackageEdgeIndex {
  const edges: PackageEdgeIndex = new Map()
  for (const dependency of imports) {
    if (dependency.scope !== scope) {
      continue
    }
    const from = dependency.from.package
    const to = dependency.to.package
    const destinations = edges.get(from) ?? new Map<string, ImportCounts>()
    const counts = destinations.get(to) ?? { 'value': 0, 'type': 0, 'compile-only': 0 }
    counts[dependency.kind]++
    destinations.set(to, counts)
    edges.set(from, destinations)
  }
  return edges
}

function participatesInEdges(edges: PackageEdgeIndex, name: string): boolean {
  return edges.has(name) || [...edges.values()].some(destinations => destinations.has(name))
}

function formatImportCounts(counts: ImportCounts): string {
  return Object.entries(counts).filter(([, count]) => count > 0).map(([kind, count]) => `${count} ${kind}`).join(', ')
}
