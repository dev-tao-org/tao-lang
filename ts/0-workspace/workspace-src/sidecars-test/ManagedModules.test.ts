import { NewlineCharacter } from '@shared'
import { FileSystem, Path, Platform, Tests } from '@shared/os'
import { checkForeignViewContract } from '../sidecars/ForeignViewContracts'
import * as ManagedModules from '../sidecars/managed-modules/ManagedModules'
import type * as ManagedModuleTypes from '../sidecars/managed-modules/ManagedModuleTypes'
import * as Fixtures from './ManagedModuleFixtures'

const ManagedModuleManifestDriftErrorRegx = /manifest drifted/
const ManagedModuleDependenciesChangedErrorRegx = /dependencies changed/
const ManagedModuleFilesChangedErrorRegx = /changed/
const ManagedNpmLockChangedErrorRegx = /durable lock is changed/
const PeerDependencyIncompatibilityErrorRegx = /peer incompatibility/
const ExactDependencyVersionRequiredErrorRegx = /exact version/
const IncompatibleReactVersionErrorRegx = /incompatible singleton react.*19\.1\.0.*19\.0\.0/
const ManagedNpmLockSuffixRegx = /\.lock$/

Tests.test('prepares a deterministic isolated Bun graph and reads it only for matching declarations', async () =>
  await Fixtures.withManagedFixture(async fixture => {
    const prepared = await assertPrepared(fixture)
    await assertProfileRepair(fixture, prepared.fingerprint)
    await assertDriftAndRepair(fixture)
    await assertFrozenReuseAndClean(fixture, prepared.fingerprint)
  }))

async function assertProfileRepair(fixture: Fixtures.ManagedFixture, fingerprint: string): Promise<void> {
  const profile = Path.join(fixture.directory, '.tao', 'cache', 'managed-modules', fingerprint)
  await assertPackageResolutionStaysInProfile(profile)
  const manifest = Path.join(profile, 'package.json')
  await FileSystem.chmod(manifest, 0o644)
  await FileSystem.writeFile(manifest, '{}')
  await Tests.rejects(ManagedModules.readManagedModules(fixture.input), ManagedModuleManifestDriftErrorRegx)
  const metadataPath = Path.join(profile, '.tao-managed.json')
  const metadata = JSON.parse(await FileSystem.readFile(metadataPath, 'utf8'))
  const currentRequirements = metadata.requirements
  metadata.requirements = [['Modules', 'date-fns', '4.1.0']]
  await FileSystem.chmod(metadataPath, 0o644)
  await FileSystem.writeFile(metadataPath, `${JSON.stringify(metadata)}${NewlineCharacter}`)
  await Tests.rejects(ManagedModules.readManagedModules(fixture.input), ManagedModuleDependenciesChangedErrorRegx)
  metadata.requirements = currentRequirements
  metadata.target = 'tampered'
  await FileSystem.writeFile(metadataPath, `${JSON.stringify(metadata)}${NewlineCharacter}`)
  await Tests.rejects(ManagedModules.readManagedModules(fixture.input), ManagedModuleDependenciesChangedErrorRegx)
  const repaired = await ManagedModules.repairManagedModuleFiles(fixture.input, fixture.executor)
  Tests.expect(repaired.fingerprint).toBe(fingerprint)
  Tests.expect(fixture.frozen()).toBe(true)
  Tests.expect(await FileSystem.readFile(manifest, 'utf8')).toContain('date-fns')
  Tests.expect(await ManagedModules.readManagedModules(fixture.input)).toEqual(repaired)
}

async function assertPackageResolutionStaysInProfile(profile: string): Promise<void> {
  const packageDirectory = Path.join(profile, 'node_modules', 'events')
  await FileSystem.mkdir(packageDirectory)
  await FileSystem.writeFile(
    Path.join(packageDirectory, 'package.json'),
    '{"name":"events","version":"3.3.0"}' + NewlineCharacter,
  )
  Tests.expect(FileSystem.resolvePackageDirectory('events', profile)).toBe(packageDirectory)
  Tests.expect(FileSystem.resolvePackageDirectory('missing-package', profile)).toBe(undefined)
}

async function assertPrepared(fixture: Fixtures.ManagedFixture): Promise<ManagedModuleTypes.PreparedManagedModules> {
  const prepared = await ManagedModules.prepareManagedModules(fixture.input, fixture.executor)
  Tests.expect(prepared.fingerprint).toBe((await ManagedModules.readManagedModules(fixture.input)).fingerprint)
  Tests.expect(await FileSystem.exists(Path.join(fixture.moduleDirectory, 'node_modules', 'date-fns'))).toBe(true)
  const dependencies = JSON.parse(await FileSystem.readFile(Path.join(fixture.moduleDirectory, 'package.json'), 'utf8'))
    .dependencies
  Tests.expect(dependencies).toEqual({ 'react': '19.1.0', 'date-fns': '4.1.0' })
  return prepared
}

async function assertDriftAndRepair(fixture: Fixtures.ManagedFixture): Promise<void> {
  const gitignore = Path.join(fixture.moduleDirectory, '.gitignore')
  const authoredIgnore = await FileSystem.readFile(gitignore, 'utf8')
  Tests.expect(authoredIgnore).toContain('# authored\nlocal.txt\n')
  Tests.expect(authoredIgnore).toContain('# tao-managed-sidecars:begin')
  const tsconfig = Path.join(fixture.moduleDirectory, 'tsconfig.json')
  await FileSystem.chmod(tsconfig, 0o644)
  await FileSystem.writeFile(tsconfig, '{}')
  Tests.expect(await ManagedModules.inspectGeneratedModuleFiles(fixture.input)).toHaveLength(1)
  await FileSystem.writeFile(gitignore, authoredIgnore.replace('/node_modules/', '/changed/'))
  Tests.expect(await ManagedModules.inspectGeneratedModuleFiles(fixture.input)).toHaveLength(2)
  await ManagedModules.repairManagedModuleFiles(fixture.input, fixture.executor)
  Tests.expect(await ManagedModules.inspectGeneratedModuleFiles(fixture.input)).toEqual([])
}

async function assertFrozenReuseAndClean(fixture: Fixtures.ManagedFixture, fingerprint: string): Promise<void> {
  const profile = Path.join(fixture.directory, '.tao', 'cache', 'managed-modules', fingerprint)
  await FileSystem.rm(Path.join(profile, 'node_modules'), { recursive: true, force: true })
  await ManagedModules.prepareManagedModules(fixture.input, fixture.executor)
  Tests.expect(fixture.frozen()).toBe(true)
  await Tests.rejects(
    ManagedModules.readManagedModules({ ...fixture.input, modules: [] }),
    ManagedModuleFilesChangedErrorRegx,
  )
  const lock = Path.join(
    fixture.directory,
    '.tao',
    'store',
    'npm',
    `${(await ManagedModules.readManagedModules(fixture.input)).graphFingerprint}.lock`,
  )
  Tests.expect(await FileSystem.exists(lock.replace(ManagedNpmLockSuffixRegx, '.sha256'))).toBe(true)
  await FileSystem.chmod(lock, 0o644)
  await FileSystem.writeFile(lock, 'tampered')
  await Tests.rejects(ManagedModules.readManagedModules(fixture.input), ManagedNpmLockChangedErrorRegx)
  await ManagedModules.cleanManagedModuleMetadata(fixture.externalModule)
  Tests.expect(await FileSystem.exists(Path.join(fixture.externalModule, 'package.json'))).toBe(true)
  await FileSystem.rm(profile, { recursive: true, force: true })
  await ManagedModules.cleanManagedModuleMetadata(fixture.directory, [fixture.externalModule])
  await assertCleanupPreservesUserFiles(fixture)
}

async function assertCleanupPreservesUserFiles(fixture: Fixtures.ManagedFixture): Promise<void> {
  Tests.expect(await FileSystem.exists(Path.join(fixture.moduleDirectory, 'package.json'))).toBe(false)
  Tests.expect(await FileSystem.readdir(Path.join(fixture.moduleDirectory, 'node_modules'))).toEqual([])
  Tests.expect(await FileSystem.exists(Path.join(fixture.externalModule, 'package.json'))).toBe(false)
  Tests.expect(await FileSystem.exists(Path.join(fixture.externalModule, 'node_modules', 'react'))).toBe(false)
  Tests.expect(await FileSystem.exists(Path.join(fixture.directory, 'Other', 'package.json'))).toBe(true)
}

Tests.test('checks a foreign view contract with the installed TypeScript compiler', async () => {
  await Fixtures.withTemporaryDirectory('foreign-view', async directory => await assertForeignView(directory))
})

async function assertForeignView(directory: string): Promise<void> {
  await FileSystem.mkdir(Path.join(directory, 'node_modules', '@types', 'react'))
  await FileSystem.writeFile(Path.join(directory, 'tsconfig.json'), foreignViewTsconfig())
  await FileSystem.writeFile(
    Path.join(directory, 'Card.ts'),
    'export function Card(props: { title: string }): unknown { return props.title }',
  )
  await FileSystem.writeFile(
    Path.join(directory, 'node_modules', '@types', 'react', 'index.d.ts'),
    'declare module "react" { export type ComponentType<Props> = (props: Props) => unknown }',
  )
  const file = await checkForeignViewContract({
    directory,
    name: 'Card',
    parameters: { title: 'string' },
    exportFile: Path.join(directory, 'Card.ts'),
    compiler: 'tsc',
  }, executeCompiler)
  Tests.expect(await FileSystem.exists(file)).toBe(true)
}

function foreignViewTsconfig(): string {
  return JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, moduleResolution: 'Bundler', module: 'ESNext' },
    include: ['**/*.ts'],
  })
}

async function executeCompiler(command: string, args: readonly string[], cwd: string) {
  return {
    status: 0,
    stdout: await Platform.capture(command, { variadicArgs: args, cwd }),
    stderr: '',
  }
}

Tests.test('rejects incompatible peer dependencies in the installed graph', async () => {
  await Fixtures.withTemporaryDirectory('managed-peers', async directory => await assertPeerFailure(directory))
})

async function assertPeerFailure(directory: string): Promise<void> {
  const input = {
    directory,
    modules: [{ directory, requirements: [{ name: 'peer-holder', version: '1.0.0', origin: 'Peer.tao' }] }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
  await Tests.rejects(ManagedModules.prepareManagedModules(input, peerExecutor), PeerDependencyIncompatibilityErrorRegx)
}

const peerExecutor: ManagedModuleTypes.BunExecutor = async (_command, args, cwd) => {
  if (args[0] === '--version') {
    return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
  }
  await Fixtures.writeLock(cwd, { 'react': '19.1.0', 'peer-holder': '1.0.0' })
  await Fixtures.writePackage(cwd, 'react', '19.1.0')
  await Fixtures.writePackage(cwd, 'peer-holder', '1.0.0', { react: '^18' })
  return { status: 0, stdout: '', stderr: '' }
}

Tests.test('rejects duplicate framework resolutions and reports their installed paths', async () => {
  await Fixtures.withTemporaryDirectory(
    'managed-singletons',
    async directory => await assertSingletonFailure(directory),
  )
})

Tests.test('rejects non-exact module requirements before starting Bun', async () => {
  const input: ManagedModuleTypes.ManagedModulesInput = {
    directory: '/unused/project',
    modules: [{
      directory: '/unused/project/Module',
      requirements: [{ name: 'date-fns', version: '^4.1.0', origin: 'Date.tao' }],
    }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
  let invoked = false
  await Tests.rejects(
    ManagedModules.prepareManagedModules(input, async () => {
      invoked = true
      return { status: 0, stdout: '', stderr: '' }
    }),
    ExactDependencyVersionRequiredErrorRegx,
  )
  Tests.expect(invoked).toBe(false)
})

async function assertSingletonFailure(directory: string): Promise<void> {
  const input = {
    directory,
    modules: [{ directory, requirements: [{ name: 'wrapper-a', version: '1.0.0', origin: 'Wrapper.tao' }] }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
  await Tests.rejects(
    ManagedModules.prepareManagedModules(input, singletonExecutor),
    IncompatibleReactVersionErrorRegx,
  )
}

const singletonExecutor: ManagedModuleTypes.BunExecutor = async (_command, args, cwd) => {
  if (args[0] === '--version') {
    return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
  }
  await Fixtures.writeLock(cwd, { 'react': '19.1.0', 'wrapper-a': '1.0.0' })
  await Fixtures.writePackage(cwd, 'react', '19.1.0')
  await Fixtures.writePackage(cwd, 'wrapper-a', '1.0.0', undefined, { react: '^19' })
  await Fixtures.writePackage(Path.join(cwd, 'node_modules', 'wrapper-a'), 'react', '19.0.0')
  return { status: 0, stdout: '', stderr: '' }
}
