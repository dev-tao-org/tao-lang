import { Errors, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'
import { satisfies, valid, validRange } from 'semver'
import TypeScript from 'typescript'
import { isNpmPackageName } from '../NpmPackageName'
import type { ManagedModulesInput, NormalizedManagedRequirement } from './ManagedModuleTypes'

/** defaultSingletonPackages lists app frameworks that require one canonical installed path. */
export const defaultSingletonPackages = ['react', 'react-dom', 'react-native', 'react-native-web', 'expo']

/** collectAllRequirements combines Tao declarations and centrally pinned app runtime packages. */
export function collectAllRequirements(
  requirements: readonly NormalizedManagedRequirement[],
  runtimePins: Record<string, string> = {},
): Record<string, string> {
  const versions = new Map<string, Map<string, Set<string>>>()
  for (const { name, version, origin } of requirements) {
    validatePackageName(name, origin)
    requireExactVersion(name, version, origin)
    addVersion(versions, name, version, origin)
  }
  for (const [name, version] of Object.entries(runtimePins)) {
    validatePackageName(name, 'runtime policy')
    requireExactVersion(name, version, 'runtime policy')
    addVersion(versions, name, version, 'runtime policy')
  }
  for (const [name, choices] of versions) {
    if (choices.size > 1) {
      const details = [...choices].map(([version, owners]) => `${version} from ${[...owners].join(', ')}`)
      Errors.ThrowUserInput(`Managed modules require incompatible versions of ${name}: ${details.join('; ')}.`)
    }
  }
  return Object.fromEntries(
    [...versions.keys()].sort().map(name => [name, [...versions.get(name)!.keys()][0]!]),
  )
}

/** validateGraph checks exact top-level pins against the immutable Bun lockfile. */
export async function validateGraph(
  profile: string,
  requirements: readonly NormalizedManagedRequirement[],
  runtimePins: Record<string, string>,
): Promise<void> {
  const source = await FileSystem.readFile(Path.join(profile, 'bun.lock'), 'utf8')
  validateGraphContents(source, requirements, runtimePins)
}

/** validateGraphContents validates exact top-level pins in a serialized Bun lock. */
export function validateGraphContents(
  source: string,
  requirements: readonly NormalizedManagedRequirement[],
  runtimePins: Record<string, string>,
): void {
  if (!graphContentsMatch(source, requirements, runtimePins)) {
    Errors.ThrowUserInput(
      'Managed npm lock does not match exact top-level requirements; repair it with: tao setup --repair.',
    )
  }
}

/** graphContentsMatch checks whether a serialized Bun lock has the required direct package pins. */
export function graphContentsMatch(
  source: string,
  requirements: readonly NormalizedManagedRequirement[],
  runtimePins: Record<string, string>,
): boolean {
  const parsed = TypeScript.parseConfigFileTextToJson('bun.lock', source)
  if (parsed.error) {
    return false
  }
  if (!parsed.config || typeof parsed.config !== 'object' || Array.isArray(parsed.config)) {
    return false
  }
  const lock = parsed.config as Record<string, unknown>
  const workspaces = lock.workspaces && typeof lock.workspaces === 'object'
    ? lock.workspaces as Record<string, unknown>
    : undefined
  const root = workspaces?.['']
  const dependencies = root && typeof root === 'object' && 'dependencies' in root
    ? objectStrings(root.dependencies)
    : {}
  const packages = lock.packages && typeof lock.packages === 'object'
    ? lock.packages as Record<string, unknown>
    : undefined
  if (!workspaces || !packages) {
    return false
  }
  const expectedRequirements = collectAllRequirements(requirements, runtimePins)
  const actualNames = Object.keys(dependencies).sort()
  const expectedNames = Object.keys(expectedRequirements).sort()
  return actualNames.length === expectedNames.length
    && actualNames.every((name, index) => name === expectedNames[index])
    && Object.entries(expectedRequirements).every(([name, expected]) => {
      const identity = packageIdentity(packages[name])
      return dependencies[name] === expected && identity === `${name}@${expected}`
    })
}

/** auditInstalledGraph resolves every reachable dependency and validates peers and singleton paths. */
export async function auditInstalledGraph(
  profile: string,
  input: ManagedModulesInput,
  requirements: readonly NormalizedManagedRequirement[],
): Promise<void> {
  const packages = await installedPackages(profile, collectAllRequirements(requirements, input.runtimePins))
  const singletons = new Set([
    ...defaultSingletonPackages,
    ...input.singletonPackages ?? [],
    ...Object.keys(input.runtimePins),
    ...packages.filter(item => item.native).map(item => item.name),
  ])
  for (const name of singletons) {
    validateSingleton(name, packages, input.runtimePins[name])
  }
}

/** listNativePackageNames lists graph packages with React Native codegen or native build files. */
export async function listNativePackageNames(profile: string): Promise<string[]> {
  const manifest = await readJson(Path.join(profile, 'package.json'))
  return [
    ...new Set(
      (await installedPackages(profile, objectStrings(manifest.dependencies)))
        .filter(item => item.native).map(item => item.name),
    ),
  ].sort()
}

type InstalledPackage = {
  directory: string
  name: string
  version: string
  native: boolean
}

function validatePackageName(name: string, owner: string): void {
  if (!isNpmPackageName(name)) {
    Errors.ThrowUserInput(`Managed npm package name ${name} in ${owner} is invalid.`)
  }
}

function requireExactVersion(name: string, version: string, origin: string): void {
  if (valid(version) !== version) {
    Errors.ThrowUserInput(`Managed npm requires an exact version for ${name} in ${origin}; received ${version}.`)
  }
}

function packageIdentity(value: unknown): string | undefined {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined
}

function addVersion(
  versions: Map<string, Map<string, Set<string>>>,
  name: string,
  version: string,
  origin: string,
): void {
  const choices = versions.get(name) ?? new Map<string, Set<string>>()
  const owners = choices.get(version) ?? new Set<string>()
  owners.add(origin)
  choices.set(version, owners)
  versions.set(name, choices)
}

function validateSingleton(name: string, packages: InstalledPackage[], expected?: string): void {
  const instances = packages.filter(item => item.name === name)
  const canonical = new Set(instances.map(item => FileSystem.realpathSync(item.directory)))
  if (canonical.size > 1 || expected && instances.some(item => item.version !== expected)) {
    const details = instances.map(item => `${item.directory}@${item.version}`).join(', ')
    Errors.ThrowUserInput(
      `Managed npm graph has incompatible singleton ${name}: ${details}. Change owning npm requirements to compatible versions, then run tao setup --repair.`,
    )
  }
}

async function installedPackages(profile: string, roots: Record<string, string>): Promise<InstalledPackage[]> {
  const graph = { packages: [] as InstalledPackage[], visited: new Set<string>() }
  for (const [name, version] of Object.entries(roots)) {
    await loadPackage(graph, name, profile, version, false)
  }
  return graph.packages
}

async function loadPackage(
  graph: { packages: InstalledPackage[]; visited: Set<string> },
  name: string,
  from: string,
  range: string | undefined,
  optional: boolean,
  peer = false,
): Promise<void> {
  validatePackageName(name, `dependency required by ${from}`)
  const alias = parseNpmAlias(range, name, from)
  const directory = await findPackageDirectory(name, from, optional, peer)
  if (!directory) {
    return
  }
  const metadata = await readJson(Path.join(directory, 'package.json'))
  validateInstalledMetadata(metadata, directory, name, alias?.name ?? name, alias?.range ?? range, peer, from)
  const canonicalDirectory = FileSystem.realpathSync(directory)
  if (graph.visited.has(canonicalDirectory)) {
    return
  }
  graph.visited.add(canonicalDirectory)
  graph.packages.push(await installedPackage(directory, metadata))
  await loadPackageDependencies(graph, directory, metadata)
}

async function findPackageDirectory(
  name: string,
  from: string,
  optional: boolean,
  peer: boolean,
): Promise<string | undefined> {
  const directory = await Try.WithDefault(
    undefined,
    () => Promise.resolve(FileSystem.resolvePackageDirectory(name, from)),
  )
  if (directory === undefined && !optional) {
    Errors.ThrowUserInput(
      `Managed npm ${peer ? 'peer incompatibility' : 'graph'}: missing ${name}, required by ${from}.`,
    )
  }
  return directory
}

function validateInstalledMetadata(
  metadata: Record<string, unknown>,
  directory: string,
  name: string,
  expectedName: string,
  range: string | undefined,
  peer: boolean,
  from: string,
): void {
  if (typeof metadata.name !== 'string' || typeof metadata.version !== 'string') {
    Errors.ThrowUserInput(
      `Managed npm ${
        peer ? 'peer' : 'dependency'
      } ${name} required by ${from} resolved invalid metadata at ${directory}.`,
    )
  }
  if (metadata.name !== expectedName) {
    Errors.ThrowUserInput(
      `Managed npm ${
        peer ? 'peer' : 'dependency'
      } ${name} required by ${from} resolved package ${metadata.name} at ${directory}.`,
    )
  }
  validateRange(name, metadata.version, range, peer)
}

async function installedPackage(directory: string, metadata: Record<string, unknown>): Promise<InstalledPackage> {
  return {
    directory,
    name: metadata.name as string,
    version: metadata.version as string,
    native: await isNativePackage(directory, metadata),
  }
}

async function loadPackageDependencies(
  graph: { packages: InstalledPackage[]; visited: Set<string> },
  directory: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const optionalDependencies = objectStrings(metadata.optionalDependencies)
  const dependencies = { ...objectStrings(metadata.dependencies), ...optionalDependencies }
  for (const [name, range] of Object.entries(dependencies)) {
    await loadPackage(graph, name, directory, range, name in optionalDependencies)
  }
  const optionalPeers = optionalPeerNames(metadata.peerDependenciesMeta)
  for (const [name, range] of Object.entries(objectStrings(metadata.peerDependencies))) {
    await loadPackage(graph, name, directory, range, optionalPeers.has(name), true)
  }
}

function validateRange(name: string, actual: string, range: string | undefined, peer: boolean): void {
  if (!range || !validRange(range)) {
    return
  }
  if (!satisfies(actual, range, { includePrerelease: true })) {
    Errors.ThrowUserInput(
      `Managed npm ${peer ? 'peer incompatibility' : 'package mismatch'}: ${name}@${actual} does not satisfy ${range}.`,
    )
  }
}

function parseNpmAlias(
  range: string | undefined,
  name: string,
  from: string,
): { name: string; range?: string } | undefined {
  if (!range?.startsWith('npm:')) {
    return undefined
  }
  const target = range.slice('npm:'.length)
  const separator = target.lastIndexOf('@')
  const targetName = separator > 0 ? target.slice(0, separator) : target
  const targetRange = separator > 0 ? target.slice(separator + 1) : undefined
  if (!isNpmPackageName(targetName) || targetRange === '') {
    Errors.ThrowUserInput(`Managed npm alias ${name} required by ${from} has invalid target ${range}.`)
  }
  return { name: targetName, range: targetRange }
}

async function isNativePackage(directory: string, metadata: Record<string, unknown>): Promise<boolean> {
  return metadata.codegenConfig !== undefined || metadata['react-native'] !== undefined
    || await FileSystem.exists(Path.join(directory, 'binding.gyp'))
    || await FileSystem.exists(Path.join(directory, 'ios'))
    || await FileSystem.exists(Path.join(directory, 'android'))
}

function objectStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function optionalPeerNames(value: unknown): Set<string> {
  if (!value || typeof value !== 'object') {
    return new Set()
  }
  return new Set(
    Object.entries(value).filter(([, metadata]) =>
      metadata && typeof metadata === 'object' && 'optional' in metadata && metadata.optional === true
    ).map(([name]) => name),
  )
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return await Try(async () => JSON.parse(await FileSystem.readFile(path, 'utf8')) as Record<string, unknown>, {
    catch: () =>
      Errors.ThrowUserInput(`Managed npm state is missing or invalid at ${path}; repair with: tao setup --repair.`),
  })
}
