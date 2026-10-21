import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Errors, Timings, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import type { SourceModule } from '@typecheck/Modules'
import { directSourceFiles } from './Catalog'
import { nearestProjectRoot, realPathInsideProject, within } from './Paths'
import { loadRequirementModules } from './Requirements'
import { bareTargets, importTargets } from './Resolver'

/** ModuleLoadOptions supplies the project fallback and external project resolver. */
export type ModuleLoadOptions = {
  directory?: string
  resolveProject?: (importer: string, alias: string) => Promise<{ root: string } | undefined>
  observeProjectSources?: (root: string, sources: readonly Pick<SourceModule, 'path' | 'document'>[]) => void
  includeModuleRequirements?: boolean
}

/** loadModules discovers and parses the source graph reachable from one parsed entry. */
export const loadModules = Timings.topLevelTimer(function(
  timings,
  entry: { path: string; document: AST.Document },
  options: ModuleLoadOptions,
  parser: ReturnType<typeof createParser>,
): Promise<SourceModule[]> {
  return timings.run(loadGraph, { entry, options, parser })
})

type LoadRequest = {
  entry: { path: string; document: AST.Document }
  options: ModuleLoadOptions
  parser: ReturnType<typeof createParser>
}

type LoadState = LoadRequest & {
  entryPath: string
  projectRoot: string
  sources: Map<string, SourceModule>
  projectRoots: Map<string, string>
  pending: string[]
  observedRoots: Set<string>
  documents: Map<string, AST.Document>
}

type Discovery = Map<string, string | undefined> & {
  imports: SourceModule['imports'][number][]
  siblings: string[]
  projectRoots: Map<string, string>
}

const loadGraph = Timings.measure(
  'modules.load',
  async function(timings, request: LoadRequest): Promise<SourceModule[]> {
    const { entry, options, parser } = request
    const absoluteEntryPath = Path.resolve(entry.path)
    const entryPath = Try.WithDefault(absoluteEntryPath, () => FileSystem.realpathSync(absoluteEntryPath))
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
      observedRoots: new Set(),
      documents: new Map([[entryPath, entry.document]]),
    }
    while (state.pending.length > 0) {
      const path = state.pending.shift()!
      const source = state.sources.get(path)!
      const found = await timings.run(discover, state, source)
      for (const [candidate, text] of found) {
        if (!state.sources.has(candidate)) {
          const document = text === undefined
            ? await readDocument(candidate, parser, state.documents, timings)
            : parseDocument(text, candidate, parser, timings)
          state.documents.set(candidate, document)
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
    return await completedGraph(state, timings)
  },
)

async function completedGraph(state: LoadState, timings: Timings): Promise<SourceModule[]> {
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
  async function(timings, state: LoadState, source: SourceModule): Promise<Discovery> {
    const found: Discovery = Object.assign(new Map(), { imports: [], siblings: [], projectRoots: new Map() })
    const projectRoot = state.projectRoots.get(source.path) ?? state.projectRoot
    await observeProject(state, projectRoot, timings)
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
    for (const statement of source.document.root.declarations.filter(AST.IsImportStatement)) {
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

async function observeProject(state: LoadState, root: string, timings: Timings): Promise<void> {
  if (state.observedRoots.has(root) || !state.options.observeProjectSources) {
    return
  }
  state.observedRoots.add(root)
  const sources = await Promise.all((await directSourceFiles(root, root)).map(async path => ({
    path,
    document: await readDocument(path, state.parser, state.documents, timings),
  })))
  state.options.observeProjectSources(root, sources)
}

async function readDocument(
  path: string,
  parser: ReturnType<typeof createParser>,
  documents: Map<string, AST.Document>,
  timings: Timings,
): Promise<AST.Document> {
  const document = documents.get(path) ?? parseDocument(await FileSystem.readFile(path, 'utf8'), path, parser, timings)
  documents.set(path, document)
  return document
}

function parseDocument(
  source: string,
  path: string,
  parser: ReturnType<typeof createParser>,
  timings: Timings,
): AST.Document {
  const document = timings.run(transform, timings.run(parser.parse, source))
  if (!document) {
    Errors.ThrowUserInput(`Cannot load Tao module with invalid syntax: ${path}.`)
  }
  return document
}

function sourceModule(path: string, document: AST.Document): SourceModule {
  return { path, document, imports: [], siblings: [] }
}
