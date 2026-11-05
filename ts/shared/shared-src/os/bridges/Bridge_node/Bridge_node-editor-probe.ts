import { S } from '../../../universal/S'

/** editorBundleProbe activates a relocated editor bundle while stubbing the host's real module slot. */
export const editorBundleProbe = S`
    const Module = require('node:module');
    const fs = require('node:fs/promises');
    const paths = require('node:path');
    const disposable = () => ({ dispose() {} });
    const editor = {
      commands: { registerCommand: disposable },
      Uri: { joinPath(base, ...parts) { return { fsPath: paths.join(base.fsPath, ...parts) }; } },
      SemanticTokensLegend: class { constructor(types) { this.tokenTypes = types; } },
      languages: {
        createDiagnosticCollection: disposable,
        registerDocumentSemanticTokensProvider: disposable,
        registerDocumentFormattingEditProvider: disposable,
      },
      workspace: {
        fs: { readFile(uri) { return fs.readFile(uri.fsPath); } },
        textDocuments: [],
        onDidOpenTextDocument: disposable,
        onDidChangeTextDocument: disposable,
        onDidCloseTextDocument: disposable,
      },
    };
    const originalLoad = Module._load;
    Module._load = function(name, ...args) {
      return name === 'vscode' ? editor : originalLoad.call(this, name, ...args);
    };
    const extension = require(process.argv[1]);
    const context = { extensionUri: { fsPath: paths.dirname(paths.dirname(process.argv[1])) }, subscriptions: [] };
    Promise.resolve(extension.activate(context)).then(() => {
      for (const subscription of context.subscriptions) subscription.dispose();
    }).catch(error => { console.error(error); process.exit(1); });
`
