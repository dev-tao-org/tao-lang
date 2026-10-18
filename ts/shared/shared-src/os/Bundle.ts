import { Errors, S, Try } from '../universal/universal'
import * as FileSystem from './FileSystem'
import * as Path from './Path'
import { capture, randomUUID } from './Platform'

/** bundleRuntime builds only captured source/configuration bytes, retaining platform package imports.
 *  Every internal input must be in the snapshot; live source files are never read during bundling. */
export async function bundleRuntime(
  entrypoints: string[],
  outdir: string,
  snapshot: { root: string; sources: Record<string, string> },
): Promise<void> {
  const directory = `${outdir}.${randomUUID()}.sources`
  await Try(async () => {
    await writeSnapshot(directory, snapshot)
    const result = await Bun.build({
      entrypoints: entrypoints.map(path => snapshotPath(directory, snapshot.root, path)),
      outdir,
      target: 'browser',
      format: 'esm',
      naming: '[name].js',
      external: ['react', 'react-native', 'react-dom', 'expo', '@expo/metro-runtime', 'tao:metro-hmr-client'],
    })
    if (!result.success) {
      Errors.ThrowUnexpected(`Runtime bundling failed: ${result.logs.map(log => log.message).join('\n')}`)
    }
  }, {
    async finally() {
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
}

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

/** validateEditorBundle activates a packaged extension under Node with only the editor API stubbed. */
export async function validateEditorBundle(path: string): Promise<void> {
  const script = S`
    const Module = require('node:module');
    const fs = require('node:fs/promises');
    const paths = require('node:path');
    const disposable = () => ({ dispose() {} });
    const editor = {
      Uri: { joinPath(base, ...parts) { return { fsPath: paths.join(base.fsPath, ...parts) }; } },
      SemanticTokensLegend: class { constructor(types) { this.tokenTypes = types; } },
      languages: {
        createDiagnosticCollection: disposable,
        registerDocumentSemanticTokensProvider: disposable,
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
    extension.activate(context).then(() => {
      for (const subscription of context.subscriptions) subscription.dispose();
    }).catch(error => { console.error(error); process.exit(1); });
  `
  await capture('node -e', { variadicArgs: [script, path] })
}

async function writeSnapshot(directory: string, snapshot: { root: string; sources: Record<string, string> }) {
  for (const [path, content] of Object.entries(snapshot.sources)) {
    const target = snapshotPath(directory, snapshot.root, path)
    await FileSystem.mkdir(Path.dirname(target), { recursive: true })
    await FileSystem.writeFile(target, content)
  }
}

function snapshotPath(directory: string, root: string, path: string): string {
  const relative = Path.relative(root, path)
  if (isOutsideSnapshotRoot(relative)) {
    Errors.ThrowUnexpected(`Runtime snapshot input is outside its source root: ${path}`)
  }
  return Path.join(directory, relative)
}

function isOutsideSnapshotRoot(relative: string): boolean {
  return relative === '..' || relative.startsWith(`..${Path.sep}`) || Path.isAbsolute(relative)
}
