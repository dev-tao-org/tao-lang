import { Json, UserInput } from '@shared'
import { Errors, NewlineCharacter, S, Try } from '@shared'
import * as Shared from '@shared'
import { FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { TypeScript } from '@tao/shared/typescript'
import { satisfies } from '../workspace-src/bridges/Bridge_semver'
import { initializeProject } from '../workspace-src/projects/Projects'
import type { BunExecutor } from '../workspace-src/sidecars/ManagedModule/ManagedModules'

/** AcceptanceProjects identifies the app and UI projects used by Metro acceptance cases. */
export type AcceptanceProjects = { app: string; ui: string; entry: string }

/** ManagedGraphFixturePaths identifies source trees used to create a recorded package graph. */
export type ManagedGraphFixturePaths = {
  runtimeModules: string
  runtimeResources: string
  fixtureModules: string
}

/** acceptanceRoot creates a temporary repository-local acceptance-test directory. */
export function acceptanceRoot(): string {
  return Repo.resolvePath('.artifacts/tmp', `managed-metro-${Platform.randomUUID()}`)
}

/** createAcceptanceProjects writes the test app and external UI project fixtures. */
export async function createAcceptanceProjects(root: string): Promise<AcceptanceProjects> {
  const app = Path.join(root, 'app')
  const ui = Path.join(root, 'ui')
  const fixtures = Repo.resolvePath('ts/0-workspace/test-workspace/managed-fixtures')
  await initializeProject(app)
  await initializeProject(ui)
  await FS.cp(Path.join(fixtures, 'app'), app, { recursive: true })
  await FS.cp(Path.join(fixtures, 'ui'), ui, { recursive: true })
  await FS.rename(Path.join(ui, '@ui/Widget.fixture'), Path.join(ui, '@ui/Widget.tsx'))
  await FS.writeFile(
    Path.join(ui, '@ui/Widget.tsx'),
    Shared.joinTextLines(
      S`
        import { label } from 'tao-fixture-label'
        export function Widget() { return label('metro-rendered') }
      `,
      '',
    ),
  )
  return { app, ui, entry: Path.join(app, 'Main.tao') }
}

/** installFixturePackage uses Bun to install the fixture from the local registry. */
export async function installFixturePackage(
  root: string,
  registry: string,
): Promise<{ nodeModules: string; lock: string }> {
  const directory = Path.join(root, 'fixture-install')
  await FS.mkdir(directory)
  await FS.writeFile(
    Path.join(directory, 'package.json'),
    Json.Print({ private: true, dependencies: { 'tao-fixture-label': '1.0.0' } }),
  )
  const installed = await createBunExecutor(root, registry)('bun', ['install', '--no-progress'], directory)
  if (installed.status !== 0) {
    Errors.ThrowHostEnvironment(
      `Could not install the local fixture npm package. ${installed.stderr || installed.stdout}`,
    )
  }
  return { nodeModules: Path.join(directory, 'node_modules'), lock: Path.join(directory, 'bun.lock') }
}

/** createManagedGraphExecutor records the runtime graph without contacting a remote registry. */
export function createManagedGraphExecutor(options: ManagedGraphFixturePaths): BunExecutor {
  return async (_command, args, directory) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: `${Platform.runtimeVersion()}${NewlineCharacter}`, stderr: '' }
    }
    await recordProfileInstall(directory, options)
    return { status: 0, stdout: '', stderr: '' }
  }
}

const FixtureInstallTimeoutMs = 15_000

function createBunExecutor(root: string, registry: string): BunExecutor {
  return async (command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: `${Platform.runtimeVersion()}${NewlineCharacter}`, stderr: '' }
    }
    // Clear both spellings because subprocess tools use different proxy-variable casing.
    const addEnv = {
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
    }
    return await Exec.capture(command, [...args, '--registry', registry], {
      cwd,
      addEnv,
      timeoutMs: FixtureInstallTimeoutMs,
    })
  }
}

async function recordProfileInstall(
  directory: string,
  options: ManagedGraphFixturePaths,
): Promise<void> {
  const nodeModules = Path.join(directory, 'node_modules')
  await FS.mkdir(nodeModules)
  const lock = await readLock(Path.join(options.runtimeResources, 'bun.lock'))
  const fixtureLock = await readLock(Path.join(Path.dirname(options.fixtureModules), 'bun.lock'))
  const manifest = Json.Parse(await FS.readFile(Path.join(directory, 'package.json'), 'utf8')) as MetroFixtureManifest
  lock.workspaces[''].dependencies = manifest.dependencies
  lock.patchedDependencies = manifest.patchedDependencies
  lock.overrides = manifest.overrides
  Object.assign(lock.packages, fixtureLock.packages)
  await materializeLockGraph(lock, options, nodeModules)
  await FS.writeFile(Path.join(directory, 'bun.lock'), `${Json.Print(lock)}${NewlineCharacter}`)
}

async function materializeLockGraph(
  lock: LockFile,
  options: ManagedGraphFixturePaths,
  nodeModules: string,
): Promise<void> {
  const sources = await readPackageSources(options)
  const packagesByName = indexLockPackages(lock)
  const wrappers = Path.join(Path.dirname(nodeModules), '.acceptance-packages')
  await FS.mkdir(wrappers)
  for (const [key, value] of Object.entries(lock.packages)) {
    const identity = lockIdentity(value)
    const source = sources.get(identity)
    if (source) {
      await createPackageWrapper(source, resolveWrapperPath(wrappers, key))
    }
  }
  for (const [key, value] of Object.entries(lock.packages)) {
    const source = sources.get(lockIdentity(value))
    if (source) {
      await linkDependencies(packagesByName, key, source, resolveWrapperPath(wrappers, key), wrappers)
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
    await FS.mkdir(scope)
    await FS.symlink(
      resolveWrapperPath(wrappers, name),
      Path.join(scope, packageName.split('/').at(-1)!),
      'dir',
    )
  }
}

async function readPackageSources(options: ManagedGraphFixturePaths): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  await scanSources(options.runtimeModules, result)
  await scanSources(Repo.resolvePath('ts/node_modules/.bun'), result, true)
  const fixture = Path.join(options.fixtureModules, 'tao-fixture-label')
  result.set('tao-fixture-label@1.0.0', fixture)
  result.set('string-width@4.1.0', Path.join(options.fixtureModules, 'string-width-cjs'))
  return result
}

async function scanSources(root: string, result: Map<string, string>, profiles = false): Promise<void> {
  const entries = await FS.readdir(root)
  for (const entry of entries) {
    const base = Path.join(root, entry)
    const moduleRoot = profiles ? Path.join(base, 'node_modules') : base
    if (profiles && !await FS.exists(moduleRoot)) {
      continue
    }
    const names = await FS.readdir(moduleRoot)
    for (const name of names) {
      if (name.startsWith('.')) {
        continue
      }
      const packageNames = name.startsWith('@')
        ? (await FS.readdir(Path.join(moduleRoot, name))).map(child => `${name}/${child}`)
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
  await FS.mkdir(target)
  for (const name of await FS.readdir(source)) {
    if (name === 'node_modules') {
      continue
    }
    const entry = Path.join(source, name)
    const destination = Path.join(target, name)
    if (name === 'package.json') {
      await FS.cp(entry, destination)
    } else {
      await FS.symlink(entry, destination, FS.lstatSync(entry).isDirectory() ? 'dir' : 'file')
    }
  }
}

async function linkDependencies(
  packagesByName: LockPackagesByName,
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
    const dependency = npmDependency(name, range)
    const child = createPackageKey(packagesByName, dependency.name, dependency.range, key)
    if (!child) {
      continue
    }
    const scope = name.startsWith('@') ? Path.join(target, name.split('/')[0]!) : target
    await FS.mkdir(scope)
    await FS.symlink(resolveWrapperPath(wrappers, child), Path.join(scope, name.split('/').at(-1)!), 'dir')
  }
}

type LockPackageCandidate = { key: string; version: string }
type LockPackagesByName = Map<string, LockPackageCandidate[]>

function indexLockPackages(lock: LockFile): LockPackagesByName {
  const packagesByName: LockPackagesByName = new Map()
  for (const [key, value] of Object.entries(lock.packages)) {
    const identity = lockIdentity(value)
    const split = identity.lastIndexOf('@')
    const name = identity.slice(0, split)
    const candidates = packagesByName.get(name) ?? []
    candidates.push({ key, version: identity.slice(split + 1) })
    packagesByName.set(name, candidates)
  }
  return packagesByName
}

function createPackageKey(packagesByName: LockPackagesByName, name: string, version: string, parent?: string): string {
  const candidates = (packagesByName.get(name) ?? []).filter(candidate => satisfies(candidate.version, version))
  const nested = parent ? candidates.find(candidate => candidate.key.startsWith(`${parent}/`)) : undefined
  const root = candidates.find(candidate => candidate.key === name)
  return (nested ?? root ?? candidates[0])?.key ?? ''
}

function npmDependency(name: string, range: string): { name: string; range: string } {
  if (!range.startsWith('npm:')) {
    return { name, range }
  }
  const target = range.slice('npm:'.length)
  const separator = target.lastIndexOf('@')
  return separator > 0
    ? { name: target.slice(0, separator), range: target.slice(separator + 1) }
    : { name, range }
}

function lockIdentity(value: unknown): string {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0].split('(')[0]! : ''
}

function resolveWrapperPath(wrappers: string, key: string): string {
  return Path.join(wrappers, key.replaceAll('/', '+'))
}

async function TryJson(path: string): Promise<Record<string, unknown> | undefined> {
  return await Try(async () => Json.Parse(await FS.readFile(path, 'utf8')) as Record<string, unknown>, {
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
  const parsed = TypeScript.parseConfigFileTextToJson(path, await FS.readFile(path, 'utf8'))
  if (parsed.error || !parsed.config) {
    UserInput.fail(`Acceptance fixture lock is invalid: ${path}`)
  }
  return parsed.config as LockFile
}

type LockFile = {
  workspaces: Record<string, { dependencies: Record<string, string> }>
  packages: Record<string, unknown>
  patchedDependencies?: Record<string, string>
  overrides?: Record<string, string>
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type MetroFixtureManifest = {
  patchedDependencies: Record<string, string>
  overrides: Record<string, string>
  dependencies: Record<string, string>
  name: string
  version: string
}
