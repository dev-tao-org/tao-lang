import { Errors, Timings, Try } from '@shared'
import { Artifacts, BuildLock, FileSystem, Path, Platform, Repo } from '@shared/os'
import { runtimeLock, type RuntimeManifest } from './runtime-lock'
import { metroBuildInputs, writeMetroResources } from './runtime-metro'
import { readRuntimeSources } from './runtime-sources'

/** prepareRuntime builds versioned, relocatable Expo runtime resources from declared source inputs. */
export const prepareRuntime = Timings.createTopLevelTimer(async function(timings): Promise<string> {
  return await BuildLock.withBuildLock(Artifacts.resolvePath('locks/runtime-build.lock'), async () => {
    const inputs = await readInputs()
    const identity = Platform.hashText(JSON.stringify(inputs))
    const directory = Artifacts.resolvePath('cache/runtime-build', identity)
    const patchRoot = Repo.resolvePath('ts/patches')
    const patches = Object.keys(inputs.sources).filter(path => Path.dirname(path) === patchRoot)
      .map(path => Path.join('patches', Path.basename(path)))
    const requiredFiles = [...resourceFiles, ...Object.keys(inputs.runtimeSources), ...patches]
    if (!requiredFiles.every(file => FileSystem.existsSync(Path.join(directory, file)))) {
      await timings.run(buildResources, directory, identity, inputs)
    }
    await publishResources(directory)
    return directory
  })
})

async function writeRuntimeSources(
  directory: string,
  sources: Record<string, string>,
  runtimeSources: Record<string, string>,
): Promise<void> {
  for (const [resource, sourcePath] of Object.entries(runtimeSources)) {
    const source = sources[Repo.resolvePath(sourcePath)]
      ?? Errors.ThrowShouldNeverHappen(`Runtime source was not captured: ${sourcePath}`)
    const target = Path.join(directory, resource)
    await FileSystem.mkdir(Path.dirname(target), { recursive: true })
    await FileSystem.writeFile(target, source)
  }
}

const packageRoot = Repo.resolvePath('ts/7-runtime')
const resourceFiles = [
  'runtime.json',
  'package.json',
  'bun.lock',
  'metro/MetroPreload.cjs',
]
const runtimeDevelopmentPackages = new Set(['typescript', '@types/react', '@types/react-dom'])

async function readInputs() {
  const runtimeSources = await readRuntimeSources()
  const paths = [
    ...Object.values(runtimeSources),
    Repo.resolvePath('ts/7-runtime/runtime-src/RuntimeResources.ts'),
    Repo.resolvePath('ts/7-runtime/package.json'),
    Repo.resolvePath('ts/CLIs/CLIs-src/cli-checks/runtime-lock.ts'),
    Path.fileURLToPath(import.meta.url),
    Repo.resolvePath('ts/bun.lock'),
    ...await metroBuildInputs(),
  ].sort()
  const sources = await Promise.all(paths.map(async path => [path, await FileSystem.readFile(path, 'utf8')] as const))
  return { sources: Object.fromEntries(sources), runtimeSources }
}

const buildResources = Timings.measured('runtime.build', async function(
  directory: string,
  identity: string,
  inputs: Awaited<ReturnType<typeof readInputs>>,
) {
  const stage = `${directory}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FileSystem.mkdir(stage, { recursive: true })
    await writeRuntimeSources(stage, inputs.sources, inputs.runtimeSources)
    await writeMetroResources(stage, inputs.sources)
    const manifest = runtimeManifest(inputs.sources)
    await FileSystem.writeFile(Path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2))
    await FileSystem.writeFile(
      Path.join(stage, 'bun.lock'),
      runtimeLock(inputs.sources[Repo.resolvePath('ts/bun.lock')]!, manifest),
    )
    await FileSystem.writeFile(
      Path.join(stage, 'runtime.json'),
      JSON.stringify(
        {
          version: 2,
          identity,
          dependencies: manifest.dependencies,
          devDependencies: manifest.devDependencies,
          sourceFiles: Object.keys(inputs.runtimeSources),
        },
        null,
        2,
      ),
    )
    await FileSystem.mkdir(Path.dirname(directory), { recursive: true })
    await FileSystem.rm(directory, { recursive: true, force: true })
    await FileSystem.rename(stage, directory)
  }, {
    async finally() {
      await FileSystem.rm(stage, { recursive: true, force: true })
    },
  })
})

function runtimeManifest(sources: Record<string, string>): RuntimeManifest {
  const parsed = JSON.parse(sources[Path.join(packageRoot, 'package.json')]!) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = parsed.dependencies ?? Errors.ThrowShouldNeverHappen('Runtime package has no dependencies.')
  const devDependencies = parsed.devDependencies ?? {}
  const workspace = JSON.parse(sources[Repo.resolvePath('ts/package.json')]!) as {
    patchedDependencies?: Record<string, string>
  }
  return {
    name: 'tao-expo-toolchain',
    private: true,
    patchedDependencies: workspace.patchedDependencies,
    dependencies: Object.fromEntries(
      Object.entries(dependencies).filter(([, version]) => !version.startsWith('workspace:')),
    ),
    devDependencies: Object.fromEntries(
      Object.entries(devDependencies).filter(([name]) => runtimeDevelopmentPackages.has(name)),
    ),
  }
}

async function publishResources(directory: string): Promise<void> {
  const target = Path.join(packageRoot, '_gen_runtime')
  if (Try.WithDefault(undefined, () => FileSystem.realpathSync(target)) === directory) {
    return
  }
  await FileSystem.replaceDirectoryLink(directory, target)
}
