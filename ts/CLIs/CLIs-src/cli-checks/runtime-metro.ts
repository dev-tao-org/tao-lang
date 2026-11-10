import { Bundle, FS, Path, Repo } from '@shared/os'
import type { RuntimeSourceContents } from './runtime-sources'

/** metroBuildInputs fingerprints the preload sources and dependency patches shipped with the runtime. */
export async function metroBuildInputs(): Promise<string[]> {
  const directories = [
    'ts/7-runtime/runtime-src/expo',
    'ts/7-runtime/runtime-src/expo/Expo',
    'ts/7-runtime/runtime-src/expo/Metro',
    'ts/shared/shared-src/os',
    'ts/shared/shared-src/bridges',
    'ts/7-runtime/runtime-src/bridges',
  ]
  const groups = await Promise.all(directories.map(async directory => {
    const root = Repo.resolvePath(directory)
    return await FS.listProductionSourceFiles(root)
  }))
  const patchRoot = Repo.resolvePath('ts/patches')
  const patches = (await FS.readdir(patchRoot)).map(name => Path.join(patchRoot, name))
  return [...groups.flat(), ...patches, Repo.resolvePath('ts/package.json'), Path.fileURLToPath(import.meta.url)]
}

/** writeMetroResources bundles the Node preload and copies pinned dependency patches into relocatable resources. */
export async function writeMetroResources(directory: string, sources: RuntimeSourceContents): Promise<void> {
  const target = Path.join(directory, 'metro')
  await Bundle.bundleNode(Repo.resolvePath('ts/7-runtime/runtime-src/expo/Metro/MetroPreload.ts'), target, [])
  await FS.rename(Path.join(target, 'MetroPreload.js'), Path.join(target, 'MetroPreload.cjs'))
  const prefix = Repo.resolvePath('ts/patches')
  for (const [source, content] of Object.entries(sources)) {
    if (Path.dirname(source) === prefix) {
      const output = Path.join(directory, 'patches', Path.basename(source))
      await FS.mkdir(Path.dirname(output))
      await FS.writeFile(output, content)
    }
  }
}
