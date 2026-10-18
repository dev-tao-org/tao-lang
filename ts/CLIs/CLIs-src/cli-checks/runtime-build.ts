import { Errors, Timings, Try } from '@shared'
import { Artifacts, BuildLock, Bundle, FileSystem, Path, Platform, Repo } from '@shared/os'
import { runtimeLock, type RuntimeManifest } from './runtime-lock'

/** prepareRuntime builds versioned, relocatable Expo runtime resources from declared source inputs. */
export async function prepareRuntime(timings = new Timings(`process:${Platform.pid}`)): Promise<string> {
  return await BuildLock.withBuildLock(Artifacts.resolvePath('locks/runtime-build.lock'), async () => {
    const inputs = await readInputs()
    const identity = Platform.hashText(JSON.stringify(inputs))
    const directory = Artifacts.resolvePath('cache/runtime-build', identity)
    if (!resourceFiles.every(file => FileSystem.existsSync(Path.join(directory, file)))) {
      const RuntimeBuild = timings.measure('runtime.build', buildResources)
      await RuntimeBuild(directory, identity, inputs)
    }
    await publishResources(directory)
    return directory
  })
}

const packageRoot = Repo.resolvePath('ts/7-runtime')
const resourceFiles = ['runtime.json', 'package.json', 'bun.lock', 'TR.js', 'HMRClient.js']

async function readInputs() {
  const paths = [
    ...await FileSystem.sourceFiles(Path.join(packageRoot, 'runtime-src')),
    ...await FileSystem.sourceFiles(Repo.resolvePath('ts/shared/shared-src/universal')),
    Repo.resolvePath('ts/shared/shared-src/os/PreviewPlatform.ts'),
    Repo.resolvePath('ts/shared/shared-src/shared.ts'),
    Repo.resolvePath('ts/7-runtime/package.json'),
    Repo.resolvePath('ts/7-runtime/tsconfig.json'),
    Repo.resolvePath('ts/shared/shared-src/os/Bundle.ts'),
    Repo.resolvePath('ts/CLIs/CLIs-src/cli-checks/runtime-lock.ts'),
    Path.fileURLToPath(import.meta.url),
    Repo.resolvePath('ts/tsconfig.base.json'),
    Repo.resolvePath('ts/bun.lock'),
  ].sort()
  const sources = await Promise.all(paths.map(async path => [path, await FileSystem.readFile(path, 'utf8')] as const))
  return { sources: Object.fromEntries(sources), bun: await Platform.capture('bun --version') }
}

async function buildResources(directory: string, identity: string, inputs: Awaited<ReturnType<typeof readInputs>>) {
  const stage = `${directory}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FileSystem.mkdir(stage, { recursive: true })
    await Bundle.bundleRuntime(
      ['TR.ts', 'HMRClient.ts'].map(name => Path.join(packageRoot, 'runtime-src', name)),
      stage,
      { root: Repo.getWorkspaceRoot(), sources: inputs.sources },
    )
    const manifest = runtimeManifest(inputs.sources[Path.join(packageRoot, 'package.json')]!)
    await FileSystem.writeFile(Path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2))
    await FileSystem.writeFile(
      Path.join(stage, 'bun.lock'),
      runtimeLock(inputs.sources[Repo.resolvePath('ts/bun.lock')]!, manifest),
    )
    await FileSystem.writeFile(
      Path.join(stage, 'runtime.json'),
      JSON.stringify({ version: 1, identity, dependencies: manifest.dependencies }, null, 2),
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
  const parsed = JSON.parse(source) as { dependencies?: Record<string, string> }
  const dependencies = parsed.dependencies ?? Errors.ThrowUnexpected('Runtime package has no dependencies.')
  return {
    name: 'tao-expo-toolchain',
    private: true,
    dependencies: Object.fromEntries(
      Object.entries(dependencies).filter(([, version]) => !version.startsWith('workspace:')),
    ),
  }
}

async function publishResources(directory: string): Promise<void> {
  const target = Path.join(packageRoot, '_gen_runtime')
  if (Try.WithDefault(undefined, () => FileSystem.realpathSync(target)) === directory) {
    return
  }
  const temporary = `${target}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FileSystem.symlink(directory, temporary, 'dir')
    await FileSystem.rename(temporary, target)
  }, {
    async finally() {
      await FileSystem.rm(temporary, { force: true })
    },
  })
}
