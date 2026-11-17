import { Errors, Invariant, Json, Sort, Timings, Try } from '@shared'
import { Artifacts, BuildLock, FS, Hash, Path, Platform, Repo } from '@shared/os'
import * as RuntimeLock from './runtime-lock'
import { metroBuildInputs, writeMetroResources } from './runtime-metro'
import { readRuntimeSources, type RuntimeSourceContents, type RuntimeSourcePaths } from './runtime-sources'

/** prepareRuntime builds versioned, relocatable Expo runtime resources from declared source inputs. */
export const prepareRuntime = Timings.createTopLevelTimer(async function(timings): Promise<string> {
  return await BuildLock.withBuildLock(Artifacts.resolvePath('locks/runtime-build.lock'), async () => {
    const inputs = await readInputs()
    const identity = createRuntimeBuildIdentity(inputs)
    const directory = Artifacts.resolvePath('cache/runtime-build', identity)
    const patchRoot = Repo.resolvePath('ts/patches')
    const patches = Object.keys(inputs.sources).filter(path => Path.dirname(path) === patchRoot)
      .map(path => Path.join('patches', Path.basename(path)))
    const requiredFiles = [...resourceFiles, ...Object.keys(inputs.runtimeSources), ...patches]
    if (!requiredFiles.every(file => FS.existsSync(Path.join(directory, file)))) {
      await timings.run(buildResources, directory, identity, inputs)
    }
    await publishResources(directory)
    return directory
  })
})

async function writeRuntimeSources(
  directory: string,
  sources: RuntimeSourceContents,
  runtimeSources: RuntimeSourcePaths,
): Promise<void> {
  for (const [resource, sourcePath] of Object.entries(runtimeSources)) {
    const source = sources[Repo.resolvePath(sourcePath)]
    if (source === undefined) {
      Errors.ThrowShouldNeverHappen(`Runtime source was not captured: ${sourcePath}`)
    }
    const target = Path.join(directory, resource)
    await FS.mkdir(Path.dirname(target))
    await FS.writeFile(target, source)
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

async function readInputs(): Promise<RuntimeBuildInputs> {
  const runtimeSources = await readRuntimeSources()
  const paths = [
    ...Object.values(runtimeSources),
    Repo.resolvePath('ts/7-runtime/runtime-src/Runtime/RuntimeResources.ts'),
    Repo.resolvePath('ts/7-runtime/package.json'),
    Repo.resolvePath('ts/CLIs/CLIs-src/cli-checks/runtime-lock.ts'),
    Path.fileURLToPath(import.meta.url),
    Repo.resolvePath('ts/bun.lock'),
    ...await metroBuildInputs(),
  ].sort(Sort.CompareStrings)
  const sources = await Promise.all(paths.map(async path => [path, await FS.readFile(path, 'utf8')] as const))
  return { sources: Object.fromEntries(sources), runtimeSources }
}

const buildResources = Timings.measured('runtime.build', async function(
  directory: string,
  identity: string,
  inputs: RuntimeBuildInputs,
) {
  const stage = `${directory}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FS.mkdir(stage)
    await writeRuntimeSources(stage, inputs.sources, inputs.runtimeSources)
    await writeMetroResources(stage, inputs.sources)
    const manifest = runtimeManifest(inputs.sources)
    await FS.writeFile(Path.join(stage, 'package.json'), formatRuntimeManifest(manifest))
    await FS.writeFile(
      Path.join(stage, 'bun.lock'),
      RuntimeLock.runtimeLock(inputs.sources[Repo.resolvePath('ts/bun.lock')]!, manifest),
    )
    await FS.writeFile(
      Path.join(stage, 'runtime.json'),
      formatRuntimeMetadata(identity, manifest, inputs.runtimeSources),
    )
    await FS.mkdir(Path.dirname(directory))
    await FS.rm(directory, { recursive: true, force: true })
    await FS.rename(stage, directory)
  }, {
    async finally() {
      await FS.rm(stage, { recursive: true, force: true })
    },
  })
})

function runtimeManifest(sources: RuntimeSourceContents): RuntimeLock.RuntimeManifest {
  const parsed = parseRuntimePackage(sources[Path.join(packageRoot, 'package.json')]!)
  const dependencies = parsed.dependencies
  Invariant(dependencies !== undefined, 'Runtime package has no dependencies.')
  const devDependencies = parsed.devDependencies === undefined ? {} : parsed.devDependencies
  const workspace = parseRuntimeWorkspace(sources[Repo.resolvePath('ts/package.json')]!)
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
  if (Try.WithDefault(undefined, () => FS.realpathSync(target)) === directory) {
    return
  }
  await FS.replaceDirectoryLink(directory, target)
}

type RuntimeBuildInputs = { sources: RuntimeSourceContents; runtimeSources: RuntimeSourcePaths }
type RuntimePackage = {
  dependencies?: RuntimeLock.RuntimeDependencyVersions
  devDependencies?: RuntimeLock.RuntimeDependencyVersions
}
type RuntimeWorkspace = { patchedDependencies?: RuntimeLock.RuntimePatchPaths }

function createRuntimeBuildIdentity(inputs: RuntimeBuildInputs): string {
  // This rebuildable cache treats object key order as semantically irrelevant.
  return Hash.Of(inputs)
}

function formatRuntimeManifest(manifest: RuntimeLock.RuntimeManifest): string {
  return Json.Print(manifest)
}

function formatRuntimeMetadata(
  identity: string,
  manifest: RuntimeLock.RuntimeManifest,
  sources: RuntimeSourcePaths,
): string {
  return Json.Print({
    version: 2,
    identity,
    dependencies: manifest.dependencies,
    devDependencies: manifest.devDependencies,
    sourceFiles: Object.keys(sources),
  })
}

function parseRuntimePackage(contents: string): RuntimePackage {
  return Json.Parse(contents) as RuntimePackage
}

function parseRuntimeWorkspace(contents: string): RuntimeWorkspace {
  return Json.Parse(contents) as RuntimeWorkspace
}
