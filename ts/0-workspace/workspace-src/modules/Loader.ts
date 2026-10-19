import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Errors, Timings } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import { directSourceFiles } from './Catalog'
import { nearestProjectRoot, realPathInsideProject, within } from './Paths'
import { bareTargets, importTargets } from './Resolver'

/** ModuleLoadOptions supplies the project fallback and external project resolver. */
export type ModuleLoadOptions = {
  directory?: string
  resolveProject?: (importer: string, alias: string) => Promise<{ root: string } | undefined>
}

/** loadModules discovers and parses the source graph reachable from one parsed entry. */
export function loadModules(
  entry: { path: string; document: AST.Document },
  options: ModuleLoadOptions,
  parser: ReturnType<typeof createParser>,
  timings: Timings,
): Promise<SourceModule[]> {
  return loadGraph(timings, { entry, options, parser, timings })
}

type LoadRequest = {
  entry: { path: string; document: AST.Document }
  options: ModuleLoadOptions
  parser: ReturnType<typeof createParser>
  timings: Timings
}

type LoadState = LoadRequest & {
  entryPath: string
  projectRoot: string
  sources: Map<string, SourceModule>
  projectRoots: Map<string, string>
  pending: string[]
}

type Discovery = Map<string, string | undefined> & {
  imports: SourceModule['imports'][number][]
  siblings: string[]
  projectRoots: Map<string, string>
}

const loadGraph = Timings.measure('modules.load', async function(request: LoadRequest): Promise<SourceModule[]> {
  const { entry, options, parser, timings } = request
  const entryPath = Path.resolve(entry.path)
  const entryDirectory = Path.dirname(entryPath)
  const configuredDirectory = options.directory && Path.resolve(options.directory)
  const projectRoot = nearestProjectRoot(entryDirectory)
    ?? (configuredDirectory && within(configuredDirectory, entryPath) ? configuredDirectory : entryDirectory)
  const state: LoadState = {
    ...request,
    entryPath,
    projectRoot,
    sources: new Map([[entryPath, sourceModule(entryPath, entry.document)]]),
    projectRoots: new Map(),
    pending: [entryPath],
  }
  while (state.pending.length > 0) {
    const path = state.pending.shift()!
    const source = state.sources.get(path)!
    const found = await discover(timings, state, source)
    for (const [candidate, text] of found) {
      if (!state.sources.has(candidate)) {
        const document = text === undefined
          ? await readDocument(candidate, parser)
          : parseDocument(text, candidate, parser)
        state.sources.set(candidate, sourceModule(candidate, document))
        state.pending.push(candidate)
      }
      const owner = found.projectRoots.get(candidate)
      if (owner) {
        state.projectRoots.set(candidate, owner)
      }
    }
    source.imports = found.imports
    source.siblings = found.siblings
  }
  return [...state.sources.values()]
})

const discover = Timings.measure(
  'modules.discover',
  async function(state: LoadState, source: SourceModule): Promise<Discovery> {
    const found: Discovery = Object.assign(new Map(), { imports: [], siblings: [], projectRoots: new Map() })
    const projectRoot = state.projectRoots.get(source.path) ?? state.projectRoot
    const physical = source.path === state.entryPath && !await FileSystem.exists(source.path)
      ? within(projectRoot, source.path) ? source.path : undefined
      : realPathInsideProject(source.path, projectRoot)
    if (physical) {
      found.siblings = await directSourceFiles(Path.dirname(physical), projectRoot)
      for (const path of found.siblings.filter(path => path !== source.path)) {
        found.set(path, undefined)
        if (state.projectRoots.has(source.path)) {
          found.projectRoots.set(path, projectRoot)
        }
      }
    }
    for (const statement of source.document.root.declarations.filter(isImportStatement)) {
      const specifier = AST.IsUsePackageStatement(statement) ? statement.from.value : statement.from?.value
      const context = { ...state, projectRoot }
      const targets = specifier === undefined
        ? await bareTargets(source.path, physical, context)
        : await importTargets(specifier, source.path, physical, context)
      found.imports.push({
        statement,
        targets: targets.map(({ path, relation }) => ({ path, relation })),
      })
      for (const target of targets) {
        if (target.projectRoot) {
          found.projectRoots.set(target.path, target.projectRoot)
        }
        if (!found.has(target.path)) {
          found.set(target.path, target.source)
        }
      }
    }
    return found
  },
)

async function readDocument(path: string, parser: ReturnType<typeof createParser>): Promise<AST.Document> {
  return parseDocument(await FileSystem.readFile(path, 'utf8'), path, parser)
}

function parseDocument(source: string, path: string, parser: ReturnType<typeof createParser>): AST.Document {
  const document = transform(parser.parse(source).tree)
  if (!document) {
    Errors.ThrowUserInput(`Cannot load Tao module with invalid syntax: ${path}.`)
  }
  return document
}

function sourceModule(path: string, document: AST.Document): SourceModule {
  return { path, document, imports: [], siblings: [] }
}

function isImportStatement(
  declaration: AST.Declaration,
): declaration is AST.UseStatement | AST.UsePackageStatement {
  return AST.IsUseStatement(declaration) || AST.IsUsePackageStatement(declaration)
}
