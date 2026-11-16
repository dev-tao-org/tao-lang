import { NewlineCharacter } from '../../universal/Characters'
import { Errors } from '../../universal/universal'
import * as BunHost from '../bridges/Bridge_bun/Bridge_bun'
import { editorBundleProbe } from '../bridges/Bridge_node/Bridge_node-editor-probe'
import { bundleBanner } from '../bridges/Bridge_node/Bridge_node-emission'
import Exec from '../Exec'
import * as FS from '../FS'
import * as Path from '../Path'
import * as Process from '../Process'

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

const LibraryBundleName = '_Library.js'
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
    naming: LibraryBundleName,
    plugins: [{
      name: 'tao-library-runtime-api',
      setup(builder) {
        builder.onResolve({ filter: RuntimeAPIImportRegx }, () => ({ path: runtimeAPIPath }))
      },
    }],
  })
  if (!result.success) {
    Errors.ThrowUserInput(`Library bundling failed: ${result.logs.map(log => log.message).join(NewlineCharacter)}`)
  }
  const directory = Path.dirname(entrypoint)
  await stabilizeBundleSourceHeaders(Path.join(outdir, LibraryBundleName), directory)
}

/** validateEditorBundle activates a packaged extension under Node with only the editor API stubbed. */
export async function validateEditorBundle(path: string): Promise<void> {
  await Exec.captureStdout('node', ['-e', editorBundleProbe, path])
}

async function stabilizeBundleSourceHeaders(path: string, sourceDirectory: string): Promise<void> {
  const source = await FS.readFile(path, 'utf8')
  const temporarySourcePath = Path.toPortablePath(Path.relative(Process.cwd(), sourceDirectory))
  const temporaryHeader = `// ${temporarySourcePath}/`
  // Bun prints one source header per module, relative to its working directory.
  // The fresh generated-only directory does not occur in authored code.
  const portableSource = source.split(NewlineCharacter).map(header =>
    header.startsWith(temporaryHeader) ? `// tao-generated/${header.slice(temporaryHeader.length)}` : header
  ).join(NewlineCharacter)
  await FS.writeIfChanged(path, portableSource)
}
