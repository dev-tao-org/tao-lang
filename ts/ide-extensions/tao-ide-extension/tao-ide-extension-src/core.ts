import * as AST from '@ast-gen'
import * as Format from '@fix/format'

import * as Shared from '@shared'
import * as Typecheck from '@typecheck'
import { Language, Parser as WebParser, Query as WebQuery, type Tree } from './Bridge_web-tree-sitter'
import * as QueryResults from './QueryResults'
import { createRetryableInitialization } from './RetryableInitialization'
import { editTreeForSource } from './SourceEdit'

/** DocumentSession owns one incrementally updated Tao tree for one document. */
export interface DocumentSession {
  update(source: string): DocumentResult
  format(options?: Format.LayoutOptions): Format.FormatResult
  dispose(): void
}

/** SessionOptions supplies the two grammars and their highlight queries. */
export interface SessionOptions {
  taoParser: WebParser
  tsxParser: WebParser
  taoQuery: WebQuery
  tsxQuery: WebQuery
  measure?: (phase: MeasurementPhase, milliseconds: number) => void
}

/** WasmAssets contains generated Tree-sitter grammars and highlight queries. */
export interface WasmAssets {
  taoGrammar: Uint8Array
  tsxGrammar: Uint8Array
  taoQuery: string
  tsxQuery: string
}

/** WasmDocumentSession owns parsers, queries and an incrementally updated document session. */
export interface WasmDocumentSession {
  document: DocumentSession
  createDocument(): DocumentSession
  dispose(): void
}

/** createWasmDocumentSession loads packaged grammars and creates a standalone document session. */
export async function createWasmDocumentSession(
  assets: WasmAssets,
  measure?: SessionOptions['measure'],
  runtimeWasmPath?: string,
): Promise<WasmDocumentSession> {
  await initializeParser(runtimeWasmPath)
  const [taoLanguage, tsxLanguage] = await Promise.all([
    Language.load(assets.taoGrammar),
    Language.load(assets.tsxGrammar),
  ])
  const taoParser = new WebParser().setLanguage(taoLanguage)
  const tsxParser = new WebParser().setLanguage(tsxLanguage)
  const taoQuery = new WebQuery(taoLanguage, assets.taoQuery)
  const tsxQuery = new WebQuery(tsxLanguage, assets.tsxQuery)
  const documents = new Set<DocumentSession>()
  let disposed = false
  const document = trackedDocument(
    createDocumentSession({ taoParser, tsxParser, taoQuery, tsxQuery, measure }),
    documents,
  )
  return {
    document,
    createDocument() {
      if (disposed) {
        Shared.Errors.ThrowShouldNeverHappen('Cannot create a document from a disposed parser')
      }
      const session = createDocumentSession({ taoParser, tsxParser, taoQuery, tsxQuery, measure })
      return trackedDocument(session, documents)
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      for (const session of documents) {
        session.dispose()
      }
      documents.clear()
      taoQuery.delete()
      tsxQuery.delete()
      taoParser.delete()
      tsxParser.delete()
    },
  }
}

interface DocumentResult {
  tokens: QueryResults.Token[]
  diagnostics: QueryResults.Diagnostic[]
}

type MeasurementPhase = 'tao.parse' | 'tao.validation' | 'tsx.parse' | 'query'

function createDocumentSession(options: SessionOptions): DocumentSession {
  let source = ''
  let taoTree: OptionalTree
  let disposed = false

  return {
    format(options) {
      if (disposed || !taoTree) {
        Shared.Errors.ThrowShouldNeverHappen('Cannot format an unavailable Tao document session')
      }
      return Format.format({ source, tree: taoTree }, options)
    },
    update(nextSource) {
      if (disposed) {
        Shared.Errors.ThrowShouldNeverHappen('Cannot update a disposed Tao document session')
      }
      const previousTree = taoTree
      taoTree = undefined
      if (previousTree) {
        editTreeForSource(previousTree, source, nextSource)
      }
      taoTree =
        Shared.Try(() => measure(options, 'tao.parse', () => options.taoParser.parse(nextSource, previousTree)), {
          finally() {
            previousTree?.delete()
          },
        }) ?? undefined
      if (!taoTree) {
        Shared.Errors.ThrowShouldNeverHappen('Tao parsing was cancelled unexpectedly')
      }
      source = nextSource
      return collectResults(options, taoTree, source)
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      taoTree?.delete()
      taoTree = undefined
    },
  }
}

function trackedDocument(session: DocumentSession, sessions: Set<DocumentSession>): DocumentSession {
  let disposed = false
  sessions.add(session)
  return {
    update: (source) => session.update(source),
    format: (options) => session.format(options),
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      session.dispose()
      sessions.delete(session)
    },
  }
}

const initializeParser = createRetryableInitialization((runtimeWasmPath?: string) =>
  WebParser.init(
    runtimeWasmPath
      ? {
        locateFile: () => runtimeWasmPath,
      }
      : undefined,
  )
)

const FencePrefix = '```ts'
const FenceSuffix = '```'

function collectResults(options: SessionOptions, tree: Tree, source: string): DocumentResult {
  const tokens = QueryResults.collectTokens(options.taoQuery, tree.rootNode, 0, measureQuery(options))
  const diagnostics = QueryResults.collectDiagnostics(tree.rootNode)
  diagnostics.push(...measure(options, 'tao.validation', () => collectTaoStatementDiagnostics(tree)))
  for (const injection of QueryResults.findNodes(tree.rootNode, 'TypeScript')) {
    const bodyStart = injection.startIndex + FencePrefix.length
    const bodyEnd = injection.endIndex - FenceSuffix.length
    if (bodyEnd < bodyStart) {
      continue
    }
    const embedded = Shared.Source.slice(source, bodyStart, bodyEnd)
    const tsxTree = measure(options, 'tsx.parse', () => options.tsxParser.parse(embedded))
    if (!tsxTree) {
      continue
    }
    Shared.Try(() => {
      tokens.push(...QueryResults.collectTokens(options.tsxQuery, tsxTree.rootNode, bodyStart, measureQuery(options)))
      diagnostics.push(...QueryResults.collectDiagnostics(tsxTree.rootNode, bodyStart))
    }, {
      finally() {
        tsxTree.delete()
      },
    })
  }
  return { tokens: QueryResults.uniqueTokens(tokens), diagnostics: QueryResults.uniqueDiagnostics(diagnostics) }
}

function collectTaoStatementDiagnostics(tree: Tree): readonly Typecheck.StatementDiagnostic[] {
  const document = AST.transform(tree)
  return document ? Typecheck.collectStatementDiagnostics(document) : []
}

function measure<T>(options: SessionOptions, phase: MeasurementPhase, operation: () => T): T {
  if (!options.measure) {
    return operation()
  }
  const start = Shared.Time.nowMs()
  const result = operation()
  options.measure(phase, Shared.Time.nowMs() - start)
  return result
}

type OptionalTree = Tree | undefined

function measureQuery(options: SessionOptions) {
  const measure = options.measure
  return measure ? (milliseconds: number) => measure('query', milliseconds) : undefined
}
