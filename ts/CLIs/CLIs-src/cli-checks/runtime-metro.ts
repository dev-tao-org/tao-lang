import { Bundle, FileSystem, Path, Repo } from '@shared/os'

/** metroBuildInputs fingerprints the preload sources and dependency patches shipped with the runtime. */
export async function metroBuildInputs(): Promise<string[]> {
  const directories = [
    'ts/7-runtime/runtime-src/expo',
    'ts/7-runtime/runtime-src/bridges',
    'ts/shared/shared-src/os',
    'ts/shared/shared-src/bridges',
  ]
  const groups = await Promise.all(directories.map(async directory => {
    const root = Repo.resolvePath(directory)
    return await FileSystem.listProductionSourceFiles(root)
  }))
  const patchRoot = Repo.resolvePath('ts/patches')
  const patches = (await FileSystem.readdir(patchRoot)).map(name => Path.join(patchRoot, name))
  return [...groups.flat(), ...patches, Repo.resolvePath('ts/package.json'), Path.fileURLToPath(import.meta.url)]
}

/** writeMetroResources bundles the Node preload and copies pinned dependency patches into relocatable resources. */
export async function writeMetroResources(directory: string, sources: Record<string, string>): Promise<void> {
  const target = Path.join(directory, 'metro')
  await Bundle.bundleNode(Repo.resolvePath('ts/7-runtime/runtime-src/expo/MetroPreload.ts'), target, [])
  await FileSystem.rename(Path.join(target, 'MetroPreload.js'), Path.join(target, 'MetroPreload.cjs'))
  const prefix = Repo.resolvePath('ts/patches')
  for (const [source, content] of Object.entries(sources)) {
    if (Path.dirname(source) === prefix) {
      const output = Path.join(directory, 'patches', Path.basename(source))
      await FileSystem.mkdir(Path.dirname(output), { recursive: true })
      await FileSystem.writeFile(output, content)
    }
  }
}
