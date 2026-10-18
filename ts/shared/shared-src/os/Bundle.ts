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
  })
  if (!result.success) {
    Errors.ThrowUserInput(`Bundling failed: ${result.logs.map(log => log.message).join('\n')}`)
  }
}

/** validateEditorBundle loads a packaged extension under Node with only the editor API stubbed. */
export async function validateEditorBundle(path: string): Promise<void> {
  const script = S`
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(name, ...args) {
      return name === 'vscode' ? {} : originalLoad.call(this, name, ...args);
    };
    const extension = require(process.argv[1]);
    if (typeof extension.activate !== 'function') process.exit(1);
  `
  await capture('node -e', { variadicArgs: [script, path] })
}
