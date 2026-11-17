import * as Runtime from '@runtime'
import { Lists, Sort, Try, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { satisfies, valid, validRange } from '../../bridges/Bridge_semver'
import { isNpmPackageName } from '../../NpmPackageName'
import * as ManagedTypes from './ManagedModuleTypes'
import * as PackageMetadata from './ManagedPackageMetadata'

/** collectAllRequirements combines Tao declarations and centrally pinned app runtime packages. */
export function collectAllRequirements(
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
  runtimePins: ManagedTypes.ManagedRuntimePins = {},
): ManagedTypes.ManagedPackageVersionMap {
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
      UserInput.fail(`Managed modules require incompatible versions of ${name}: ${details.join('; ')}.`)
    }
  }
  return Object.fromEntries(
    [...versions.keys()].sort(Sort.CompareStrings).map(name => [name, [...versions.get(name)!.keys()][0]!]),
  )
}

/** validateGraph checks exact top-level pins against the immutable Bun lockfile. */
export async function validateGraph(
  profile: string,
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
  runtimePins: ManagedTypes.ManagedRuntimePins,
): Promise<void> {
  const source = await FS.readFile(Path.join(profile, 'bun.lock'), 'utf8')
  validateGraphContents(source, requirements, runtimePins)
}

/** validateGraphContents validates exact top-level pins in a serialized Bun lock. */
export function validateGraphContents(
  source: string,
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
  runtimePins: ManagedTypes.ManagedRuntimePins,
): void {
  UserInput.require(
    !!graphContentsMatch(source, requirements, runtimePins),
    'Managed npm lock does not match exact top-level requirements; repair it with: tao setup --repair.',
  )
}

/** graphContentsMatch checks whether a serialized Bun lock has the required direct package pins. */
export function graphContentsMatch(
  source: string,
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
  runtimePins: ManagedTypes.ManagedRuntimePins,
): boolean {
  const parsed = TypeScript.parseConfigFileTextToJson('bun.lock', source)
  if (parsed.error) {
    return false
  }
  if (!PackageMetadata.isLockMetadata(parsed.config)) {
    return false
  }
  const lock = parsed.config
  const workspaces = PackageMetadata.isMetadataObject(lock.workspaces)
    ? lock.workspaces
    : undefined
  const root = workspaces?.['']
  const dependencies = PackageMetadata.hasPackageDependencies(root)
    ? PackageMetadata.readStringEntries(root.dependencies)
    : {}
  const packages = PackageMetadata.isMetadataObject(lock.packages)
    ? lock.packages
    : undefined
  if (!workspaces || !packages) {
    return false
  }
  const expectedRequirements = collectAllRequirements(requirements, runtimePins)
  const actualNames = Object.keys(dependencies).sort(Sort.CompareStrings)
  const expectedNames = Object.keys(expectedRequirements).sort(Sort.CompareStrings)
  return actualNames.length === expectedNames.length
    && actualNames.every((name, index) => name === expectedNames[index])
    && Object.entries(expectedRequirements).every(([name, expected]) => {
      const identity = PackageMetadata.readLockedPackageIdentity(packages[name])
      return dependencies[name] === expected && identity === `${name}@${expected}`
    })
}

/** auditInstalledGraph resolves every reachable dependency and validates peers and singleton paths. */
export async function auditInstalledGraph(
  profile: string,
  input: ManagedTypes.ManagedModulesInput,
  requirements: readonly ManagedTypes.NormalizedManagedRequirement[],
): Promise<void> {
  const packages = await installedPackages(profile, collectAllRequirements(requirements, input.runtimePins))
  const nativePackageNames = packages.filter(item => item.native).map(item => item.name)
  const singletons = Runtime.resolveRuntimeSingletonPackages(input.singletonPackages, nativePackageNames)
  for (const name of singletons) {
    validateSingleton(name, packages, input.runtimePins[name])
  }
}

/** listNativePackageNames lists graph packages with React Native codegen or native build files. */
export async function listNativePackageNames(profile: string): Promise<string[]> {
  const manifest = await PackageMetadata.readPackageMetadata(Path.join(profile, 'package.json'))
  const dependencies = PackageMetadata.readStringEntries(manifest.dependencies)
  const packages = await installedPackages(profile, dependencies)
  const nativePackages = packages.filter(item => item.native)
  const nativePackageNames = nativePackages.map(item => item.name)
  const uniqueNativePackageNames = Lists.unique(nativePackageNames)
  return uniqueNativePackageNames.sort(Sort.CompareStrings)
}

type DependencyVersionRange = string | undefined

const NativePackageMarkerFiles = ['binding.gyp', 'ios', 'android']

type InstalledPackage = {
  directory: string
  name: string
  version: string
  native: boolean
}

type InstalledPackageGraph = { packages: InstalledPackage[]; visited: Set<string> }

function validatePackageName(name: string, owner: string): void {
  if (!isNpmPackageName(name)) {
    UserInput.fail(`Managed npm package name ${name} in ${owner} is invalid.`)
  }
}

function requireExactVersion(name: string, version: string, origin: string): void {
  if (valid(version) !== version) {
    UserInput.fail(`Managed npm requires an exact version for ${name} in ${origin}; received ${version}.`)
  }
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
  const canonical = new Set(instances.map(item => FS.realpathSync(item.directory)))
  if (canonical.size > 1 || expected && instances.some(item => item.version !== expected)) {
    const details = instances.map(item => `${item.directory}@${item.version}`).join(', ')
    UserInput.fail(
      `Managed npm graph has incompatible singleton ${name}: ${details}. Change owning npm requirements to compatible versions, then run tao setup --repair.`,
    )
  }
}

async function installedPackages(
  profile: string,
  roots: ManagedTypes.ManagedPackageVersionMap,
): Promise<InstalledPackage[]> {
  const graph = { packages: [] as InstalledPackage[], visited: new Set<string>() }
  for (const [name, version] of Object.entries(roots)) {
    await loadPackage(graph, name, profile, version, false)
  }
  return graph.packages
}

async function loadPackage(
  graph: InstalledPackageGraph,
  name: string,
  from: string,
  range: DependencyVersionRange,
  optional: boolean,
  peer = false,
): Promise<void> {
  validatePackageName(name, `dependency required by ${from}`)
  const alias = parseNpmAlias(range, name, from)
  const directory = await findPackageDirectory(name, from, optional, peer)
  if (!directory) {
    return
  }
  const metadata = await PackageMetadata.readPackageMetadata(Path.join(directory, 'package.json'))
  validateInstalledMetadata(metadata, directory, name, alias?.name ?? name, alias?.range ?? range, peer, from)
  const canonicalDirectory = FS.realpathSync(directory)
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
    () => Promise.resolve(FS.resolvePackageDirectory(name, from)),
  )
  if (directory === undefined && !optional) {
    UserInput.fail(`Managed npm ${peer ? 'peer incompatibility' : 'graph'}: missing ${name}, required by ${from}.`)
  }
  return directory
}

function validateInstalledMetadata(
  metadata: PackageMetadata.ManagedMetadataFields,
  directory: string,
  name: string,
  expectedName: string,
  range: DependencyVersionRange,
  peer: boolean,
  from: string,
): asserts metadata is PackageMetadata.InstalledPackageMetadata {
  if (!PackageMetadata.hasPackageIdentity(metadata)) {
    UserInput.fail(
      `Managed npm ${
        peer ? 'peer' : 'dependency'
      } ${name} required by ${from} resolved invalid metadata at ${directory}.`,
    )
  }
  if (metadata.name !== expectedName) {
    UserInput.fail(
      `Managed npm ${
        peer ? 'peer' : 'dependency'
      } ${name} required by ${from} resolved package ${metadata.name} at ${directory}.`,
    )
  }
  validateRange(name, metadata.version, range, peer)
}

async function installedPackage(
  directory: string,
  metadata: PackageMetadata.InstalledPackageMetadata,
): Promise<InstalledPackage> {
  return {
    directory,
    name: metadata.name,
    version: metadata.version,
    native: await isNativePackage(directory, metadata),
  }
}

async function loadPackageDependencies(
  graph: InstalledPackageGraph,
  directory: string,
  metadata: PackageMetadata.ManagedMetadataFields,
): Promise<void> {
  const optionalDependencies = PackageMetadata.readStringEntries(metadata.optionalDependencies)
  const dependencies = collectPackageDependencies(metadata, optionalDependencies)
  for (const [name, range] of Object.entries(dependencies)) {
    await loadPackage(graph, name, directory, range, PackageMetadata.isOptionalDependency(name, optionalDependencies))
  }
  const optionalPeers = PackageMetadata.readOptionalPeerNames(metadata.peerDependenciesMeta)
  for (const [name, range] of Object.entries(PackageMetadata.readStringEntries(metadata.peerDependencies))) {
    await loadPackage(graph, name, directory, range, optionalPeers.has(name), true)
  }
}

function collectPackageDependencies(
  metadata: PackageMetadata.ManagedMetadataFields,
  optionalDependencies: ManagedTypes.ManagedPackageVersionMap,
): ManagedTypes.ManagedPackageVersionMap {
  const requiredDependencies = PackageMetadata.readStringEntries(metadata.dependencies)
  return { ...requiredDependencies, ...optionalDependencies }
}

function validateRange(name: string, actual: string, range: DependencyVersionRange, peer: boolean): void {
  if (!range || !validRange(range)) {
    return
  }
  if (!satisfies(actual, range, { includePrerelease: true })) {
    UserInput.fail(
      `Managed npm ${peer ? 'peer incompatibility' : 'package mismatch'}: ${name}@${actual} does not satisfy ${range}.`,
    )
  }
}

type ParsedNpmAlias = { name: string; range?: string }

function parseNpmAlias(
  range: DependencyVersionRange,
  name: string,
  from: string,
): ParsedNpmAlias | undefined {
  if (!range?.startsWith('npm:')) {
    return undefined
  }
  const target = range.slice('npm:'.length)
  const separator = target.lastIndexOf('@')
  const targetName = separator > 0 ? target.slice(0, separator) : target
  const targetRange = separator > 0 ? target.slice(separator + 1) : undefined
  if (!isNpmPackageName(targetName) || targetRange === '') {
    UserInput.fail(`Managed npm alias ${name} required by ${from} has invalid target ${range}.`)
  }
  return { name: targetName, range: targetRange }
}

async function isNativePackage(directory: string, metadata: PackageMetadata.ManagedMetadataFields): Promise<boolean> {
  if (hasNativePackageMetadata(metadata)) {
    return true
  }
  return await hasNativePackageMarker(directory)
}

function hasNativePackageMetadata(metadata: PackageMetadata.ManagedMetadataFields): boolean {
  return metadata.codegenConfig !== undefined || metadata['react-native'] !== undefined
}

async function hasNativePackageMarker(directory: string): Promise<boolean> {
  for (const marker of NativePackageMarkerFiles) {
    if (await FS.exists(Path.join(directory, marker))) {
      return true
    }
  }
  return false
}
