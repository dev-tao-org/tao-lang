import { NewlineCharacter } from '../../universal/Characters'
import * as UserInput from '../../universal/UserInput'

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
    UserInput.Fail(`Bundling failed: ${result.logs.map(log => log.message).join(NewlineCharacter)}`)
  }
}

/** validateEditorBundle activates a packaged extension under Node with only the editor API stubbed. */
export async function validateEditorBundle(path: string): Promise<void> {
  await Exec.captureStdout('node', ['-e', editorBundleProbe, path])
}
