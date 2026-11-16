import { NewlineCharacter } from '../../universal/Characters'
import { Errors } from '../../universal/universal'
import * as BunHost from '../bridges/Bridge_bun/Bridge_bun'
import { editorBundleProbe } from '../bridges/Bridge_node/Bridge_node-editor-probe'
import { bundleBanner } from '../bridges/Bridge_node/Bridge_node-emission'
import Exec from '../Exec'

/** bundleNode bundles a TypeScript entry for Node hosts while preserving declared external APIs. */
export async function bundleNode(entrypoint: string, outdir: string, external: string[]): Promise<void> {
  const result = await BunHost.getRuntime().build({
    entrypoints: [entrypoint],
    outdir,
    target: 'node',
    format: 'cjs',
    external,
    naming: '[name].js',
    banner: bundleBanner,
    define: { 'import.meta.url': '__taoImportMetaUrl' },
  })
  if (!result.success) {
    Errors.ThrowUserInput(`Bundling failed: ${result.logs.map(log => log.message).join(NewlineCharacter)}`)
  }
}

const RuntimeAPIImportRegx = /^@tao\/runtime-api$/

/** bundleLibrary emits one portable runtime closure while leaving host React and native peers external. */
export async function bundleLibrary(
  entrypoint: string,
  outdir: string,
  tsconfig: string,
  runtimeAPIPath: string,
): Promise<void> {
  const result = await BunHost.getRuntime().build({
    entrypoints: [entrypoint],
    outdir,
    target: 'browser',
    format: 'esm',
    throw: false,
    tsconfig,
    external: ['react', 'react/jsx-runtime', 'react-native', '@preact/signals-core'],
    naming: '_Library.js',
    plugins: [{
      name: 'tao-library-runtime-api',
      setup(builder) {
        builder.onResolve({ filter: RuntimeAPIImportRegx }, () => ({ path: runtimeAPIPath }))
      },
    }],
  })
  if (!result.success) {
    Errors.ThrowUserInput(`Library bundling failed: ${result.logs.map(log => log.message).join('\n')}`)
  }
}

/** validateEditorBundle activates a packaged extension under Node with only the editor API stubbed. */
export async function validateEditorBundle(path: string): Promise<void> {
  await Exec.captureStdout('node', ['-e', editorBundleProbe, path])
}
