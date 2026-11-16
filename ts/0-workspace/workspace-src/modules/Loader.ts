import * as AST from '@ast-gen'
import type * as Grammar from '@grammar'
import * as SourceValidation from '@source-validation'
import type * as Typecheck from '@typecheck'

import { Errors, Timings } from '@shared'
import { FS, Path } from '@shared/os'

import { listDirectSourceFiles } from './Catalog'
import * as Paths from './Paths'
import { loadRequirementModules } from './Requirements'
import { importTargets, type ModuleResolutionContext, resolveBareTargets } from './Resolver'

/** ModuleLoadOptions supplies the project fallback and external project resolver. */
export type ModuleLoadOptions = {
  directory?: string
  resolveProject?: (importer: string, alias: string) => Promise<ProjectResolution>
  observeProjectSources?: (root: string, sources: readonly Pick<Typecheck.SourceModule, SourceModuleField>[]) => void
  includeModuleRequirements?: boolean
  beforeLoad?: () => Promise<void>
}

/** loadModules discovers the source graph, validating each reached document before resolving its imports.
 *  Successful results are nonempty, with the canonical entry module first. */
export const loadModules = Timings.createTopLevelTimer(function(
  timings,
  entry: { path: string; document: AST.Document },
  options: ModuleLoadOptions,
  parser: Grammar.Parser,
): Promise<Typecheck.SourceModule[]> {
  return timings.run(loadGraph, { entry, options, parser })
})

type ProjectResolution = { root: string } | undefined
type SourceModuleField = 'path' | 'document'

type LoadRequest = {
  entry: { path: string; document: AST.Document }
  options: ModuleLoadOptions
  parser: Grammar.Parser
}

type LoadState = LoadRequest & {
  entryPath: string
  projectRoot: string
  sources: Map<string, Typecheck.SourceModule>
  projectRoots: Map<string, string>
  pending: string[]
  observedRoots: Set<string>
  documents: Map<string, AST.Document>
}

type DiscoveredSourceText = string | undefined
type PhysicalSourcePath = string | undefined

type Discovery = {
  sources: Map<string, DiscoveredSourceText>
  imports: Typecheck.SourceModule['imports'][number][]
  siblings: string[]
  projectRoots: Map<string, string>
}

const loadGraph = Timings.measure(
  'modules.load',
  async function(timings, request: LoadRequest): Promise<Typecheck.SourceModule[]> {
    const { entry, options } = request
    const entryPath = Paths.resolveCanonicalPath(entry.path)
    timings.run(ValidateStatements, entry.document, entryPath)
    if (options.beforeLoad) {
      await timings.run(LoadSources, options.beforeLoad)
    }
    const projectRoot = resolveEntryProjectRoot(entryPath, options.directory)
    const state = createLoadState(request, entryPath, projectRoot)
    while (state.pending.length > 0) {
      await loadNextSource(state, timings)
    }
    return await completedGraph(state, timings)
  },
)

const ValidateStatements = Timings.measured('source.validate', SourceValidation.assertValidStatements)
const LoadSources = Timings.measured('dependencies.sources', (load: () => Promise<void>) => load())

function resolveEntryProjectRoot(entryPath: string, configuredDirectory?: string): string {
  const entryDirectory = Path.dirname(entryPath)
  const absoluteConfiguredDirectory = configuredDirectory && Paths.resolveCanonicalPath(configuredDirectory)
  const projectRoot = Paths.findNearestProjectRoot(entryDirectory)
  if (projectRoot !== undefined) {
    return projectRoot
  }
  if (absoluteConfiguredDirectory && Paths.within(absoluteConfiguredDirectory, entryPath)) {
    return absoluteConfiguredDirectory
  }
  return entryDirectory
}

async function loadNextSource(state: LoadState, timings: Timings): Promise<void> {
  const path = state.pending.shift()!
  const source = state.sources.get(path)!
  const discovery = await timings.run(discover, state, source)
  await addDiscoveredSources(state, discovery, timings)
  source.imports = discovery.imports
  source.siblings = discovery.siblings
}

async function addDiscoveredSources(
  state: LoadState,
  discovery: Discovery,
  timings: Timings,
): Promise<void> {
  for (const [candidate, text] of discovery.sources) {
    if (!state.sources.has(candidate)) {
      const document = text === undefined
        ? await readDocument(candidate, state.parser, state.documents, timings)
        : parseDocument(text, candidate, state.parser, timings)
      timings.run(ValidateStatements, document, candidate)
      state.documents.set(candidate, document)
      state.sources.set(candidate, sourceModule(candidate, document))
      state.pending.push(candidate)
    }
    const owner = discovery.projectRoots.get(candidate)
    if (owner) {
      state.projectRoots.set(candidate, owner)
    }
  }
}

function createLoadState(request: LoadRequest, entryPath: string, projectRoot: string): LoadState {
  const document = request.entry.document
  return {
    ...request,
    entryPath,
    projectRoot,
    sources: new Map([[entryPath, sourceModule(entryPath, document)]]),
    projectRoots: new Map(),
    pending: [entryPath],
    observedRoots: new Set(),
    documents: new Map([[entryPath, document]]),
  }
}

async function completedGraph(state: LoadState, timings: Timings): Promise<Typecheck.SourceModule[]> {
  const sources = [...state.sources.values()]
  return state.options.includeModuleRequirements
    ? [
      ...sources,
      ...await loadRequirementModules(
        sources,
        state.projectRoot,
        path => readDocument(path, state.parser, state.documents, timings),
      ),
    ]
    : sources
}

const discover = Timings.measure(
  'modules.discover',
  async function(timings, state: LoadState, source: Typecheck.SourceModule): Promise<Discovery> {
    const found: Discovery = { sources: new Map(), imports: [], siblings: [], projectRoots: new Map() }
    const projectRoot = state.projectRoots.get(source.path) ?? state.projectRoot
    await observeProject(state, projectRoot, timings)
    const physical = await resolvePhysicalSourcePath(source.path, state.entryPath, projectRoot)
    await discoverSiblings(state, source, physical, projectRoot, found)
    await discoverImports(state, source, physical, projectRoot, found)
    return found
  },
)

async function discoverSiblings(
  state: LoadState,
  source: Typecheck.SourceModule,
  physical: PhysicalSourcePath,
  projectRoot: string,
  discovery: Discovery,
): Promise<void> {
  if (!physical) {
    return
  }
  discovery.siblings = await listDirectSourceFiles(Path.dirname(physical), projectRoot)
  for (const path of discovery.siblings.filter(path => path !== source.path)) {
    discovery.sources.set(path, undefined)
    if (state.projectRoots.has(source.path)) {
      discovery.projectRoots.set(path, projectRoot)
    }
  }
}

async function discoverImports(
  state: LoadState,
  source: Typecheck.SourceModule,
  physical: PhysicalSourcePath,
  projectRoot: string,
  discovery: Discovery,
): Promise<void> {
  for (const statement of AST.GetImportStatements(source.document)) {
    const specifier = AST.IsUsePackageStatement(statement) ? statement.from.value : statement.from?.value
    const context = createModuleResolutionContext(state, projectRoot)
    const targets = specifier === undefined
      ? await resolveBareTargets(source.path, physical, context)
      : await importTargets(specifier, source.path, physical, context)
    discovery.imports.push({
      statement,
      targets: targets.map(({ path, relation }) => ({ path, relation })),
    })
    for (const target of targets) {
      if (target.projectRoot) {
        discovery.projectRoots.set(target.path, target.projectRoot)
      }
      if (!discovery.sources.has(target.path)) {
        discovery.sources.set(target.path, target.source)
      }
    }
  }
}

async function resolvePhysicalSourcePath(
  sourcePath: string,
  entryPath: string,
  projectRoot: string,
): Promise<string | undefined> {
  if (sourcePath === entryPath && !await FS.exists(sourcePath)) {
    if (Paths.within(projectRoot, sourcePath)) {
      return sourcePath
    }
    return undefined
  }
  return Paths.resolveRealPathInsideProject(sourcePath, projectRoot)
}

function createModuleResolutionContext(state: LoadState, projectRoot: string): ModuleResolutionContext {
  return { options: state.options, projectRoot }
}

async function observeProject(state: LoadState, root: string, timings: Timings): Promise<void> {
  if (state.observedRoots.has(root) || !state.options.observeProjectSources) {
    return
  }
  state.observedRoots.add(root)
  const sources = await Promise.all((await listDirectSourceFiles(root, root)).map(async path => ({
    path,
    document: await readDocument(path, state.parser, state.documents, timings),
  })))
  state.options.observeProjectSources(root, sources)
}

async function readDocument(
  path: string,
  parser: Grammar.Parser,
  documents: Map<string, AST.Document>,
  timings: Timings,
): Promise<AST.Document> {
  const document = documents.get(path) ?? parseDocument(await FS.readFile(path, 'utf8'), path, parser, timings)
  documents.set(path, document)
  return document
}

function parseDocument(
  source: string,
  path: string,
  parser: Grammar.Parser,
  timings: Timings,
): AST.Document {
  const document = timings.run(AST.transform, timings.run(parser.parse, source))
  if (!document) {
    Errors.ThrowUserInput(`Cannot load Tao module with invalid syntax: ${path}.`)
  }
  return document
}

function sourceModule(path: string, document: AST.Document): Typecheck.SourceModule {
  return { path, document, imports: [], siblings: [] }
}
