import { runCommand } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Artifacts, BuildLock, Env, FileSystem, Path, Platform, Repo } from '@shared/os'

/** prepareNativeLocks builds the shared kernel-lock addon with the pinned native toolchain. */
export async function prepareNativeLocks(): Promise<void> {
  await BuildLock.withBuildLock(Artifacts.resolvePath('locks/native-lock-build.lock'), buildNativeLocks)
}

type NativeInputs = {
  identity: string
  node: { version: string; executable: string; architecture: string; platform: string }
  includeDirectory: string
  sourceContents: string[]
}

const sourceRoot = Repo.resolvePath('ts/shared/shared-src/os/platforms/locks')
const sharedRoot = Repo.resolvePath('ts/shared')
const outputRoot = Artifacts.resolvePath('cache/native-locks')
const sourceNames = ['binding.gyp', 'SessionLock.cc']

async function buildNativeLocks(): Promise<void> {
  const inputs = await readInputs()
  const versionRoot = Path.join(outputRoot, inputs.identity)
  const binary = Path.join(versionRoot, 'build/Release/tao_os_locks.node')
  if (await canReuse(inputs.identity, binary, versionRoot)) {
    await publishPointer(inputs.identity)
    return
  }
  const staging = Artifacts.resolvePath('cache', `.native-locks-${Platform.randomUUID()}`)
  await FileSystem.mkdir(outputRoot, { recursive: true })
  await Try(async () => {
    await writeSources(staging, inputs)
    await buildStagedAddon(staging, inputs.node)
    await publish(staging, versionRoot, inputs.identity)
  }, { finally: () => FileSystem.rm(staging, { recursive: true, force: true }) })
}

async function readInputs(): Promise<NativeInputs> {
  const sourceContents = await Promise.all(
    sourceNames.map(name => FileSystem.readFile(Path.join(sourceRoot, name), 'utf8')),
  )
  const builderSource = await FileSystem.readFile(import.meta.filename, 'utf8')
  const node = JSON.parse(
    await Platform.capture(
      'node -p JSON.stringify({version:process.version,executable:process.execPath,architecture:process.arch,platform:process.platform})',
    ),
  ) as NativeInputs['node']
  const [addon, nodeGyp, include] = await Promise.all([
    packageMetadata('node-addon-api'),
    packageMetadata('node-gyp'),
    addonIncludeDirectory(),
  ])
  const nodeRoot = Path.dirname(Path.dirname(node.executable))
  const nodeVersionHeader = Path.join(nodeRoot, 'include/node/node_version.h')
  const headerHash = await FileSystem.exists(nodeVersionHeader)
    ? Platform.hashText(await FileSystem.readFile(nodeVersionHeader, 'utf8'))
    : 'node-gyp-managed-headers'
  const lockHash = Platform.hashText(await FileSystem.readFile(Repo.resolvePath('ts/bun.lock'), 'utf8'))
  const environment = await toolchainEnvironment()
  const identity = Platform.hashText(JSON.stringify({
    sources: sourceContents,
    builderSource,
    node,
    nodeVersionHeader: headerHash,
    nodeAddonApi: addon.version,
    nodeGyp: nodeGyp.version,
    architecture: Platform.systemInfo().architecture,
    system: Platform.systemInfo(),
    bun: Platform.runtimeVersion(),
    lockHash,
    environment,
  }))
  return { identity, node, includeDirectory: Path.resolve(sharedRoot, include), sourceContents }
}

async function packageMetadata(
  packageName: string,
): Promise<{ root: string; version: string }> {
  const entry = FileSystem.resolveModule(packageName, sharedRoot)
  let directory = Path.dirname(entry)
  while (true) {
    const manifestPath = Path.join(directory, 'package.json')
    if (await FileSystem.exists(manifestPath)) {
      const manifest = JSON.parse(await FileSystem.readFile(manifestPath, 'utf8')) as {
        name?: string
        version?: string
      }
      if (manifest.name === packageName && manifest.version) {
        return { root: directory, version: manifest.version }
      }
    }
    const parent = Path.dirname(directory)
    if (parent === directory) {
      Errors.ThrowHostEnvironment(`Cannot locate the installed package metadata for ${packageName}.`)
    }
    directory = parent
  }
}

async function addonIncludeDirectory(): Promise<string> {
  return await Platform.capture('node -p require("node-addon-api").include_dir', { cwd: sharedRoot })
}

async function toolchainEnvironment(): Promise<unknown> {
  const paths = ['devenv.lock', 'devenv.nix', '.config/nix/toolchain-packages.nix']
  const sources = await Promise.all(paths.map(path => FileSystem.readFile(Repo.resolvePath(path), 'utf8')))
  const environment = Env.snapshot()
  return {
    sources: Platform.hashText(sources.join('\n')),
    variables: Object.fromEntries(['CC', 'CXX', 'CFLAGS', 'CXXFLAGS', 'SDKROOT', 'GYP_MSVS_VERSION']
      .map(name => [name, environment[name]])),
  }
}

async function canReuse(identity: string, binary: string, versionRoot: string): Promise<boolean> {
  const stamp = Path.join(versionRoot, 'inputs.json')
  if (!await FileSystem.exists(binary)) {
    return false
  }
  if (!await FileSystem.exists(stamp)) {
    await FileSystem.writeFile(stamp, identity)
    return true
  }
  return await FileSystem.readFile(stamp, 'utf8') === identity
}

async function writeSources(staging: string, inputs: NativeInputs): Promise<void> {
  await FileSystem.mkdir(staging, { recursive: true })
  const gyp = inputs.sourceContents[0]!.replace(/<!.+?include_dir"\)/, quoteGypPath(inputs.includeDirectory))
  await FileSystem.writeFile(Path.join(staging, sourceNames[0]!), gyp)
  await FileSystem.writeFile(Path.join(staging, sourceNames[1]!), inputs.sourceContents[1]!)
}

function quoteGypPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/'/g, "\\'")
}

async function buildStagedAddon(staging: string, node: NativeInputs['node']): Promise<void> {
  const headers = FileSystem.existsSync(Path.join(nodeRoot(node), 'include/node/node.h'))
    ? ['--nodedir', nodeRoot(node)]
    : []
  await runCommand('node-gyp rebuild --loglevel=warn --directory', {
    variadicArgs: [staging, ...headers],
    cwd: sharedRoot,
    env: { NODE_OPTIONS: nodeGypEnvironment() },
  })
}

function nodeRoot(node: NativeInputs['node']): string {
  return Path.dirname(Path.dirname(node.executable))
}

function nodeGypEnvironment(): string {
  const flag = '--disable-warning=DEP0169'
  const options = (Env.get('NODE_OPTIONS') ?? '').split(/\s+/).filter(Boolean)
  if (!options.includes(flag)) {
    options.push(flag)
  }
  return options.join(' ')
}

async function publish(staging: string, versionRoot: string, identity: string): Promise<void> {
  await discardInvalidVersion(versionRoot, identity)
  await FileSystem.writeFile(Path.join(staging, 'inputs.json'), identity)
  await FileSystem.rename(staging, versionRoot)
  await publishPointer(identity)
}

async function discardInvalidVersion(versionRoot: string, identity: string): Promise<void> {
  if (!await FileSystem.exists(versionRoot)) {
    return
  }
  const pointer = Path.join(outputRoot, 'current.json')
  if (await FileSystem.exists(pointer)) {
    const current = JSON.parse(await FileSystem.readFile(pointer, 'utf8')) as { identity?: string }
    if (current.identity === identity) {
      Errors.ThrowHostEnvironment(`The active native lock addon is incomplete: ${versionRoot}`)
    }
  }
  await FileSystem.rm(versionRoot, { recursive: true, force: true })
}

async function publishPointer(identity: string): Promise<void> {
  const pointer = Path.join(outputRoot, 'current.json')
  const pending = `${pointer}.${Platform.randomUUID()}.pending`
  await Try(async () => {
    await FileSystem.writeFile(pending, JSON.stringify({ identity }))
    await FileSystem.rename(pending, pointer)
  }, { finally: () => FileSystem.rm(pending, { force: true }) })
}
