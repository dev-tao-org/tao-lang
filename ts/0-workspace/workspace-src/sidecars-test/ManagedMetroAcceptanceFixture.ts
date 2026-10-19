import { Errors, Try } from '@shared'
import { Env, FileSystem, Http, Path, Platform, Repo } from '@shared/os'
import { satisfies } from 'semver'
import TypeScript from 'typescript'
import { initializeProject } from '../projects/Projects'
import type { BunExecutor } from '../sidecars/ManagedModules'

/** acceptanceRoot creates a temporary repository-local acceptance-test directory. */
export function acceptanceRoot(): string {
  return Repo.resolvePath('.artifacts/tmp', `managed-metro-${Platform.randomUUID()}`)
}

/** createAcceptanceProjects writes the test app and external UI project fixtures. */
export async function createAcceptanceProjects(root: string): Promise<{ app: string; ui: string; entry: string }> {
  const app = Path.join(root, 'app')
  const ui = Path.join(root, 'ui')
  const fixtures = Repo.resolvePath('ts/0-workspace/workspace-test/managed-fixtures')
  await initializeProject(app)
  await initializeProject(ui)
  await FileSystem.cp(Path.join(fixtures, 'app'), app, { recursive: true })
  await FileSystem.cp(Path.join(fixtures, 'ui'), ui, { recursive: true })
  await FileSystem.rename(Path.join(ui, '@ui/Widget.fixture'), Path.join(ui, '@ui/Widget.tsx'))
  await FileSystem.writeFile(
    Path.join(ui, '@ui/Widget.tsx'),
    "import { label } from 'tao-fixture-label'\nexport function Widget() { return label('metro-rendered') }\n",
  )
  return { app, ui, entry: Path.join(app, 'Main.tao') }
}

/** createLocalRegistry serves the fixture npm package over loopback only. */
export async function createLocalRegistry(root: string) {
  const packages = await packageArtifacts(root)
  const server = Http.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const path = Http.url(request.url).pathname
      const tarball = /^\/tarballs\/([a-z0-9-]+)\.tgz$/.exec(path)
      if (tarball) {
        const artifact = packages.get(tarball[1]!)
        return artifact ? Http.bytesResponse(artifact.bytes) : Http.response('missing tarball', { status: 404 })
      }
      const name = path.slice(1)
      const artifact = packages.get(name)
      return artifact
        ? Http.jsonResponse(metadata(name, artifact, request.url))
        : Http.response('not found', { status: 404 })
    },
  })
  return { url: `http://127.0.0.1:${server.port}`, stop: (force?: boolean) => server.stop(force) }
}

/** installFixturePackage uses Bun to install the fixture from the local registry. */
export async function installFixturePackage(
  root: string,
  registry: string,
): Promise<{ nodeModules: string; lock: string }> {
  const directory = Path.join(root, 'fixture-install')
  await FileSystem.mkdir(directory, { recursive: true })
  await FileSystem.writeFile(
    Path.join(directory, 'package.json'),
    JSON.stringify({ private: true, dependencies: { 'tao-fixture-label': '1.0.0' } }, null, 2),
  )
  const installed = await bunExecutor(root, registry)('bun', ['install', '--no-progress'], directory)
  if (installed.status !== 0) {
    Errors.ThrowHostEnvironment(
      `Could not install the local fixture npm package. ${installed.stderr || installed.stdout}`,
    )
  }
  return { nodeModules: Path.join(directory, 'node_modules'), lock: Path.join(directory, 'bun.lock') }
}

/** managedGraphExecutor records the runtime graph without contacting a remote registry. */
export function managedGraphExecutor(options: {
  runtimeModules: string
  runtimeResources: string
  fixtureModules: string
}): BunExecutor {
  return async (_command, args, directory) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: `${Platform.runtimeVersion()}\n`, stderr: '' }
    }
    await recordProfileInstall(directory, options)
    return { status: 0, stdout: '', stderr: '' }
  }
}

function bunExecutor(root: string, registry: string): BunExecutor {
  return async (command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: `${Platform.runtimeVersion()}\n`, stderr: '' }
    }
    const child = Platform.spawn([command, ...args, '--registry', registry], {
      cwd,
      env: {
        ...Env.snapshot(),
        HOME: root,
        USERPROFILE: root,
        BUN_INSTALL_CACHE_DIR: Path.join(root, 'bun-cache'),
        BUN_CONFIG_REGISTRY: registry,
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        ALL_PROXY: '',
        http_proxy: '',
        https_proxy: '',
        all_proxy: '',
        NO_PROXY: '*',
        no_proxy: '*',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Platform.readText(child.stdout),
      Platform.readText(child.stderr),
    ])
    return { status, stdout, stderr }
  }
}

async function recordProfileInstall(
  directory: string,
  options: { runtimeModules: string; runtimeResources: string; fixtureModules: string },
): Promise<void> {
  const nodeModules = Path.join(directory, 'node_modules')
  await FileSystem.mkdir(nodeModules, { recursive: true })
  const lock = await readLock(Path.join(options.runtimeResources, 'bun.lock'))
  const fixtureLock = await readLock(Path.join(Path.dirname(options.fixtureModules), 'bun.lock'))
  lock.workspaces[''].dependencies =
    JSON.parse(await FileSystem.readFile(Path.join(directory, 'package.json'), 'utf8')).dependencies
  lock.packages['tao-fixture-label'] = fixtureLock.packages['tao-fixture-label']
  await materializeLockGraph(lock, options, nodeModules)
  await FileSystem.writeFile(Path.join(directory, 'bun.lock'), `${JSON.stringify(lock, null, 2)}\n`)
}

async function materializeLockGraph(
  lock: LockFile,
  options: { runtimeModules: string; runtimeResources: string; fixtureModules: string },
  nodeModules: string,
): Promise<void> {
  const sources = await packageSources(options)
  const wrappers = Path.join(Path.dirname(nodeModules), '.acceptance-packages')
  await FileSystem.mkdir(wrappers, { recursive: true })
  for (const [key, value] of Object.entries(lock.packages)) {
    const identity = lockIdentity(value)
    const source = sources.get(identity)
    if (source) {
      await createPackageWrapper(source, wrapperPath(wrappers, key))
    }
  }
  for (const [key, value] of Object.entries(lock.packages)) {
    const source = sources.get(lockIdentity(value))
    if (source) {
      await linkDependencies(lock, key, source, wrapperPath(wrappers, key), wrappers)
    }
  }
  for (const name of Object.keys(lock.packages)) {
    const value = lock.packages[name]
    if (!value) {
      continue
    }
    const packageName = lockIdentity(value).slice(0, lockIdentity(value).lastIndexOf('@'))
    if (!packageName || packageName !== name) {
      continue
    }
    const scope = name.startsWith('@') ? Path.join(nodeModules, name.split('/')[0]!) : nodeModules
    await FileSystem.mkdir(scope, { recursive: true })
    await FileSystem.symlink(wrapperPath(wrappers, name), Path.join(scope, packageName.split('/').at(-1)!), 'dir')
  }
}

async function packageSources(options: {
  runtimeModules: string
  runtimeResources: string
  fixtureModules: string
}): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  await scanSources(options.runtimeModules, result)
  await scanSources(Repo.resolvePath('ts/node_modules/.bun'), result, true)
  const fixture = Path.join(options.fixtureModules, 'tao-fixture-label')
  result.set('tao-fixture-label@1.0.0', fixture)
  return result
}

async function scanSources(root: string, result: Map<string, string>, profiles = false): Promise<void> {
  const entries = await FileSystem.readdir(root)
  for (const entry of entries) {
    const base = Path.join(root, entry)
    const moduleRoot = profiles ? Path.join(base, 'node_modules') : base
    if (profiles && !await FileSystem.exists(moduleRoot)) {
      continue
    }
    const names = await FileSystem.readdir(moduleRoot)
    for (const name of names) {
      if (name.startsWith('.')) {
        continue
      }
      const packageNames = name.startsWith('@')
        ? (await FileSystem.readdir(Path.join(moduleRoot, name))).map(child => `${name}/${child}`)
        : [name]
      for (const packageName of packageNames) {
        const source = Path.join(moduleRoot, packageName)
        const metadata = await TryJson(Path.join(source, 'package.json'))
        if (metadata) {
          result.set(`${metadata.name}@${metadata.version}`, source)
        }
      }
    }
  }
}

async function createPackageWrapper(source: string, target: string): Promise<void> {
  await FileSystem.mkdir(target, { recursive: true })
  for (const name of await FileSystem.readdir(source)) {
    if (name === 'node_modules') {
      continue
    }
    const entry = Path.join(source, name)
    const destination = Path.join(target, name)
    if (name === 'package.json') {
      await FileSystem.cp(entry, destination)
    } else {
      await FileSystem.symlink(entry, destination, FileSystem.lstatSync(entry).isDirectory() ? 'dir' : 'file')
    }
  }
}

async function linkDependencies(
  lock: LockFile,
  key: string,
  source: string,
  wrapper: string,
  wrappers: string,
): Promise<void> {
  const metadata = await TryJson(Path.join(source, 'package.json'))
  if (!metadata) {
    return
  }
  const dependencies = { ...stringMap(metadata.dependencies), ...stringMap(metadata.optionalDependencies) }
  const target = Path.join(wrapper, 'node_modules')
  for (const [name, range] of Object.entries(dependencies ?? {})) {
    const child = packageKey(lock, name, range, key)
    if (!child) {
      continue
    }
    const scope = name.startsWith('@') ? Path.join(target, name.split('/')[0]!) : target
    await FileSystem.mkdir(scope, { recursive: true })
    await FileSystem.symlink(wrapperPath(wrappers, child), Path.join(scope, name.split('/').at(-1)!), 'dir')
  }
}

function packageKey(lock: LockFile, name: string, version: string, parent?: string): string {
  const matching = Object.entries(lock.packages).filter(([, value]) => {
    const identity = lockIdentity(value)
    const split = identity.lastIndexOf('@')
    return identity.slice(0, split) === name && satisfies(identity.slice(split + 1), version)
  })
  const nested = parent ? matching.find(([key]) => key.startsWith(`${parent}/`)) : undefined
  const candidates = matching
  const root = candidates.find(([key]) => key === name)
  return (nested ?? root ?? candidates[0])?.[0] ?? ''
}

function lockIdentity(value: unknown): string {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0].split('(')[0]! : ''
}

function wrapperPath(wrappers: string, key: string): string {
  return Path.join(wrappers, key.replaceAll('/', '+'))
}

async function TryJson(path: string): Promise<Record<string, unknown> | undefined> {
  return await Try(async () => JSON.parse(await FileSystem.readFile(path, 'utf8')) as Record<string, unknown>, {
    catch: () => undefined,
  })
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

async function readLock(path: string): Promise<LockFile> {
  const parsed = TypeScript.parseConfigFileTextToJson(path, await FileSystem.readFile(path, 'utf8'))
  if (parsed.error || !parsed.config) {
    Errors.ThrowUserInput(`Acceptance fixture lock is invalid: ${path}`)
  }
  return parsed.config as LockFile
}

async function packageArtifacts(root: string): Promise<Map<string, PackageArtifact>> {
  const packages = new Map<string, PackageArtifact>()
  const source = Repo.resolvePath('ts/0-workspace/workspace-test/managed-fixtures/packages/tao-fixture-label')
  const directory = Path.join(root, 'registry', 'tao-fixture-label', 'package')
  await FileSystem.mkdir(Path.dirname(directory), { recursive: true })
  await FileSystem.cp(source, directory, { recursive: true })
  await FileSystem.rename(Path.join(directory, 'index-js.fixture'), Path.join(directory, 'index.js'))
  const archive = Path.join(root, 'registry', 'tao-fixture-label.tgz')
  await Platform.capture('tar', { variadicArgs: ['-czf', archive, 'package'], cwd: Path.dirname(directory) })
  const bytes = await FileSystem.readFile(archive)
  packages.set('tao-fixture-label', { bytes, integrity: Platform.hashBytes(bytes, 'sha512') })
  return packages
}

function metadata(name: string, artifact: PackageArtifact, requestUrl: string): unknown {
  const version = '1.0.0'
  const origin = Http.url(requestUrl).origin
  return {
    name,
    versions: {
      [version]: {
        name,
        version,
        dist: { tarball: `${origin}/tarballs/${name}.tgz`, integrity: `sha512-${artifact.integrity}` },
      },
    },
    'dist-tags': { latest: version },
  }
}

type PackageArtifact = { bytes: Http.Bytes; integrity: string }
type LockFile = {
  workspaces: Record<string, { dependencies: Record<string, string> }>
  packages: Record<string, unknown>
}
