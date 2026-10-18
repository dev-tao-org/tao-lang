import { RuntimeSourceResources } from '@runtime/RuntimeResources'
import { Errors, Timings, Try } from '@shared'
import { Artifacts, BuildLock, FileSystem, Path, Platform, Repo } from '@shared/os'
import { runtimeLock, type RuntimeManifest } from './runtime-lock'

/** prepareRuntime builds versioned, relocatable Expo runtime resources from declared source inputs. */
export async function prepareRuntime(timings = new Timings(`process:${Platform.pid}`)): Promise<string> {
  return await BuildLock.withBuildLock(Artifacts.resolvePath('locks/runtime-build.lock'), async () => {
    const inputs = await readInputs()
    const identity = Platform.hashText(JSON.stringify(inputs))
    const directory = Artifacts.resolvePath('cache/runtime-build', identity)
    if (!resourceFiles.every(file => FileSystem.existsSync(Path.join(directory, file)))) {
      await RuntimeBuild(timings, directory, identity, inputs)
    }
    await publishResources(directory)
    return directory
  })
}

/** writeRuntimeSources packages only captured, declared source resources. */
export async function writeRuntimeSources(directory: string, sources: Record<string, string>): Promise<void> {
  for (const [resource, sourcePath] of Object.entries(RuntimeSourceResources)) {
    const source = sources[Repo.resolvePath(sourcePath)]
      ?? Errors.ThrowUnexpected(`Runtime source was not captured: ${sourcePath}`)
    const target = Path.join(directory, resource)
    await FileSystem.mkdir(Path.dirname(target), { recursive: true })
    await FileSystem.writeFile(target, source)
  }
}

const RuntimeBuild = Timings.measure('runtime.build', buildResources)

const packageRoot = Repo.resolvePath('ts/7-runtime')
const resourceFiles = ['runtime.json', 'package.json', 'bun.lock', ...Object.keys(RuntimeSourceResources)]
const runtimeDevelopmentPackages = new Set(['typescript', '@types/react', '@types/react-dom'])

async function readInputs() {
  const paths = [
    ...Object.values(RuntimeSourceResources).map(path => Repo.resolvePath(path)),
    Repo.resolvePath('ts/7-runtime/runtime-src/RuntimeResources.ts'),
    Repo.resolvePath('ts/7-runtime/package.json'),
    Repo.resolvePath('ts/CLIs/CLIs-src/cli-checks/runtime-lock.ts'),
    Path.fileURLToPath(import.meta.url),
    Repo.resolvePath('ts/bun.lock'),
  ].sort()
  const sources = await Promise.all(paths.map(async path => [path, await FileSystem.readFile(path, 'utf8')] as const))
  return { sources: Object.fromEntries(sources) }
}

async function buildResources(directory: string, identity: string, inputs: Awaited<ReturnType<typeof readInputs>>) {
  const stage = `${directory}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FileSystem.mkdir(stage, { recursive: true })
    await writeRuntimeSources(stage, inputs.sources)
    const manifest = runtimeManifest(inputs.sources[Path.join(packageRoot, 'package.json')]!)
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
          sourceFiles: Object.keys(RuntimeSourceResources),
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
}

function runtimeManifest(source: string): RuntimeManifest {
  const parsed = JSON.parse(source) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = parsed.dependencies ?? Errors.ThrowUnexpected('Runtime package has no dependencies.')
  const devDependencies = parsed.devDependencies ?? {}
  return {
    name: 'tao-expo-toolchain',
    private: true,
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
