import { Errors, S } from '../universal/universal'
import { capture } from './Platform'

/** bundleNode bundles a TypeScript entry for Node hosts while preserving declared external APIs. */
export async function bundleNode(entrypoint: string, outdir: string, external: string[]): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir,
    target: 'node',
    format: 'cjs',
    external,
    naming: '[name].js',
    banner: 'const __taoImportMetaUrl = require("node:url").pathToFileURL(__filename).href;',
    define: { 'import.meta.url': '__taoImportMetaUrl' },
  })
  if (!result.success) {
    Errors.ThrowUserInput(`Bundling failed: ${result.logs.map(log => log.message).join('\n')}`)
  }
}

/** bundleLibrary emits one portable runtime closure while leaving host React and native peers external. */
export async function bundleLibrary(entrypoint: string, outdir: string, tsconfig: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir,
    target: 'browser',
    format: 'esm',
    tsconfig,
    external: ['react', 'react/jsx-runtime', 'react-native', '@preact/signals-core'],
    naming: '_Library.js',
  })
  if (!result.success) {
    Errors.ThrowUserInput(`Library bundling failed: ${result.logs.map(log => log.message).join('\n')}`)
  }
}

/** validateEditorBundle activates a packaged extension under Node with only the editor API stubbed. */
export async function validateEditorBundle(path: string): Promise<void> {
  const script = S`
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
  await capture('node -e', { variadicArgs: [script, path] })
}
