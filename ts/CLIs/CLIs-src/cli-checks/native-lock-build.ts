import { runCommand } from '@cli-kit'
import { Try } from '@shared'
import { Artifacts, BuildLock, Env, FileSystem, Path, Platform, Repo } from '@shared/os'
import * as NodeAddonApi from '../../../shared/shared-src/os/bridges/Bridge_node-addon-api'
import * as NodeGyp from '../../../shared/shared-src/os/bridges/Bridge_node-gyp'
import { nodeMetadataProbe } from '../../../shared/shared-src/os/bridges/Bridge_node/Bridge_node-emission'
import * as NativeLockPublication from './NativeLockPublication'
import { nodeGypOptions } from './NodeGyp'

/** prepareNativeLocks builds the shared kernel-lock addon with the pinned native toolchain. */
export async function prepareNativeLocks(): Promise<void> {
  await BuildLock.withBuildLock(Artifacts.resolvePath('locks/native-lock-build.lock'), buildNativeLocks)
}

async function prepareNativeLock(
  root: string,
  identity: string,
  canReuse: (pointer: { identity: string; directory: string }) => Promise<boolean>,
  build: () => Promise<void>,
): Promise<void> {
  const current = await NativeLockPublication.readNativeLockPointerForSetup(root)
  if (current?.identity === identity && await canReuse(current)) {
    return
  }
  const stablePointer = { identity, directory: identity }
  if (await canReuse(stablePointer)) {
    await NativeLockPublication.writeNativeLockPointer(root, stablePointer)
    return
  }
  await build()
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
  await prepareNativeLock(
    outputRoot,
    inputs.identity,
    async pointer => await canReusePointer(inputs.identity, pointer),
    async () => {
      const staging = Artifacts.resolvePath('cache', `.native-locks-${Platform.randomUUID()}`)
      await FileSystem.mkdir(outputRoot, { recursive: true })
      await Try(async () => {
        await writeSources(staging, inputs)
        await buildStagedAddon(staging, inputs.node)
        await NativeLockPublication.publishNativeLockVersion(outputRoot, staging, inputs.identity)
      }, { finally: () => FileSystem.rm(staging, { recursive: true, force: true }) })
    },
  )
}

async function readInputs(): Promise<NativeInputs> {
  const sourceContents = await Promise.all(
    sourceNames.map(name => FileSystem.readFile(Path.join(sourceRoot, name), 'utf8')),
  )
  const builderSource = await readBuilderSources()
  const node = JSON.parse(
    await Platform.capture('node -p', { variadicArgs: [nodeMetadataProbe] }),
  ) as NativeInputs['node']
  const [addon, nodeGyp, include] = await Promise.all([
    NodeAddonApi.readMetadata(sharedRoot),
    NodeGyp.readMetadata(sharedRoot),
    NodeAddonApi.readIncludeDirectory(sharedRoot),
  ])
  const nodeRoot = nodeGypOptions(node.executable, Env.get('NODE_OPTIONS')).root
  const nodeVersionHeader = Path.join(nodeRoot, 'include/node/node_version.h')
  const headerHash = await FileSystem.exists(nodeVersionHeader)
    ? Platform.hashText(await FileSystem.readFile(nodeVersionHeader, 'utf8'))
    : 'node-gyp-managed-headers'
  const lockHash = Platform.hashText(await FileSystem.readFile(Repo.resolvePath('ts/bun.lock'), 'utf8'))
  const environment = await toolchainEnvironment()
  const system = Platform.systemInfo()
  const identity = Platform.hashText(JSON.stringify({
    sources: sourceContents,
    builderSource,
    node,
    nodeVersionHeader: headerHash,
    nodeAddonApi: addon.version,
    nodeGyp: nodeGyp.version,
    architecture: system.architecture,
    system,
    bun: Platform.runtimeVersion(),
    lockHash,
    environment,
  }))
  return { identity, node, includeDirectory: Path.resolve(sharedRoot, include), sourceContents }
}

async function readBuilderSources(): Promise<string[]> {
  const paths = [
    import.meta.filename,
    Repo.resolvePath('ts/shared/shared-src/os/PackageResources.ts'),
    Repo.resolvePath('ts/shared/shared-src/os/bridges/Bridge_node/Bridge_node-emission.ts'),
    Repo.resolvePath('ts/shared/shared-src/os/bridges/Bridge_node-addon-api.ts'),
    Repo.resolvePath('ts/shared/shared-src/os/bridges/Bridge_node-gyp.ts'),
  ]
  return await Promise.all(paths.map(path => FileSystem.readFile(path, 'utf8')))
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

async function canReusePointer(
  identity: string,
  pointer: { identity: string; directory: string },
): Promise<boolean> {
  return await canReuse(
    identity,
    Path.join(NativeLockPublication.nativeLockVersionRoot(outputRoot, pointer), 'build/Release/tao_os_locks.node'),
    NativeLockPublication.nativeLockVersionRoot(outputRoot, pointer),
  )
}

async function canReuse(identity: string, binary: string, versionRoot: string): Promise<boolean> {
  const stamp = Path.join(versionRoot, 'inputs.json')
  if (!await FileSystem.exists(binary)) {
    return false
  }
  if (!await FileSystem.exists(stamp)) {
    return false
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
  const options = nodeGypOptions(node.executable, Env.get('NODE_OPTIONS'))
  await runCommand('node-gyp rebuild --loglevel=warn --directory', {
    variadicArgs: [staging, ...options.headers],
    cwd: sharedRoot,
    env: options.environment,
  })
}
