import * as vscode from 'vscode'
import { createWasmDocumentSession, type DocumentSession } from './core'

/** activate registers Tao parsing, diagnostics and semantic highlighting in VS Code. */
export async function activate(context: vscode.ExtensionContext) {
  const assets = await loadAssets(context)
  const parser = await createWasmDocumentSession(
    assets,
    undefined,
    vscode.Uri.joinPath(context.extensionUri, 'runtime', 'web-tree-sitter.wasm').fsPath,
  )
  registerLanguage(context, parser)
}

/** deactivate releases document-owned WASM resources. */
export function deactivate() {}

const semanticTokenTypes = [
  'keyword',
  'type',
  'function',
  'string',
  'variable',
  'property',
  'comment',
  'number',
  'operator',
]

interface DocumentState {
  version: number
  tokens: Array<{ start: number; end: number; kind: string }>
  diagnostics: Array<{ start: number; end: number; message: string }>
  session?: DocumentSession
}

class TaoSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  constructor(
    private readonly sessions: Map<string, DocumentState>,
    private readonly legend: vscode.SemanticTokensLegend,
  ) {}

  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
    const state = this.sessions.get(document.uri.toString())
    if (!state || state.version !== document.version) {
      return new vscode.SemanticTokens(new Uint32Array())
    }
    const builder = new vscode.SemanticTokensBuilder(this.legend)
    const seen = new Set<string>()
    let previousEnd = -1
    for (const token of state.tokens) {
      const type = semanticTokenTypes.indexOf(token.kind)
      const key = `${token.start}:${token.end}:${type}`
      if (type < 0 || seen.has(key) || token.start < previousEnd) {
        continue
      }
      seen.add(key)
      pushSingleLineToken(builder, document, token.start, token.end, semanticTokenTypes[type])
      previousEnd = token.end
    }
    return builder.build()
  }
}

function registerLanguage(
  context: vscode.ExtensionContext,
  parser: Awaited<ReturnType<typeof createWasmDocumentSession>>,
) {
  const diagnostics = vscode.languages.createDiagnosticCollection('tao')
  const sessions = new Map<string, DocumentState>()
  const legend = new vscode.SemanticTokensLegend(semanticTokenTypes)
  const provider = new TaoSemanticTokensProvider(sessions, legend)
  context.subscriptions.push(
    diagnostics,
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'tao' }, provider, legend),
    vscode.workspace.onDidOpenTextDocument(document => refreshDocument(document, parser, diagnostics, sessions)),
    vscode.workspace.onDidChangeTextDocument(event => refreshDocument(event.document, parser, diagnostics, sessions)),
    vscode.workspace.onDidCloseTextDocument(document => disposeDocument(document, diagnostics, sessions)),
    {
      dispose() {
        parser.dispose()
      },
    },
  )
  for (const document of vscode.workspace.textDocuments) {
    refreshDocument(document, parser, diagnostics, sessions)
  }
}

function refreshDocument(
  document: vscode.TextDocument,
  parser: Awaited<ReturnType<typeof createWasmDocumentSession>>,
  diagnostics: vscode.DiagnosticCollection,
  sessions: Map<string, DocumentState>,
) {
  if (document.languageId !== 'tao') {
    return
  }
  const key = document.uri.toString()
  const state = sessions.get(key) ?? { version: -1, tokens: [], diagnostics: [] }
  if (state.version === document.version) {
    return
  }
  if (!state.session) {
    state.session = parser.createDocument()
  }
  const result = state.session.update(document.getText())
  state.version = document.version
  state.tokens = result.tokens
  state.diagnostics = result.diagnostics
  sessions.set(key, state)
  diagnostics.set(
    document.uri,
    result.diagnostics.map(item =>
      new vscode.Diagnostic(
        new vscode.Range(document.positionAt(item.start), document.positionAt(item.end)),
        item.message,
        vscode.DiagnosticSeverity.Error,
      )
    ),
  )
}

function disposeDocument(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  sessions: Map<string, DocumentState>,
) {
  sessions.get(document.uri.toString())?.session?.dispose()
  sessions.delete(document.uri.toString())
  diagnostics.delete(document.uri)
}

function pushSingleLineToken(
  builder: vscode.SemanticTokensBuilder,
  document: vscode.TextDocument,
  start: number,
  end: number,
  type: string,
) {
  while (start < end) {
    const position = document.positionAt(start)
    const lineEnd = document.offsetAt(new vscode.Position(position.line, document.lineAt(position.line).text.length))
    const tokenEnd = Math.min(end, lineEnd)
    if (tokenEnd > start) {
      builder.push(new vscode.Range(document.positionAt(start), document.positionAt(tokenEnd)), type, [])
    }
    const nextLine = position.line + 1
    if (tokenEnd >= end || nextLine >= document.lineCount) {
      break
    }
    start = document.offsetAt(new vscode.Position(nextLine, 0))
  }
}

async function loadAssets(context: vscode.ExtensionContext) {
  const read = async (path: string) => vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, path))
  const [taoGrammar, tsxGrammar, taoQuery, tsxQuery] = await Promise.all([
    read('grammars/tree-sitter-tao.wasm'),
    read('grammars/tree-sitter-tsx.wasm'),
    read('queries/tao-highlights.scm'),
    read('queries/tsx-highlights.scm'),
  ])
  return {
    taoGrammar,
    tsxGrammar,
    taoQuery: new TextDecoder().decode(taoQuery),
    tsxQuery: new TextDecoder().decode(tsxQuery),
  }
}
