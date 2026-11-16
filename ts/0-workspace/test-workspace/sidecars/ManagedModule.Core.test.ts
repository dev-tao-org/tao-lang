import { Json } from '@shared'
import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path } from '@shared/os'
import Exec from '@shared/os/exec'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { checkForeignViewContract } from '../../workspace-src/sidecars/ForeignViewContracts'
import * as ManagedModules from '../../workspace-src/sidecars/ManagedModule/ManagedModules'
import type * as ManagedModuleTypes from '../../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'
import * as Fixtures from './ManagedModule.test-fixtures'

const ManagedModuleManifestDriftErrorRegx = /manifest drifted/
const ManagedModuleDependenciesChangedErrorRegx = /dependencies changed/
const ManagedModuleFilesChangedErrorRegx = /changed/
const ManagedNpmLockChangedErrorRegx = /durable lock is changed/
const PeerDependencyIncompatibilityErrorRegx = /peer incompatibility/
const ExactDependencyVersionRequiredErrorRegx = /exact version/
const IncompatibleReactVersionErrorRegx = /incompatible singleton react.*19\.1\.0.*19\.0\.0/
const ManagedNpmLockSuffixRegx = /\.lock$/

Tests.test('root module TypeScript config resolves hidden-directory defaults', async () =>
  await Fixtures.withManagedFixture(async fixture => {
    const input = {
      ...fixture.input,
      modules: [{ directory: fixture.directory, requirements: fixture.input.modules[0]!.requirements }],
    }
    await FS.writeFile(Path.join(fixture.directory, 'Example.ts'), 'export const example = 1')
    await ManagedModules.prepareManagedModules(input, fixture.executor)
    const configPath = Path.join(fixture.directory, 'tsconfig.json')
    const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile)
    Tests.expect(config.error).toBeUndefined()
    const parsed = TypeScript.parseJsonConfigFileContent(config.config, TypeScript.sys, fixture.directory)
    Tests.expect(parsed.errors).toEqual([])
    Tests.expect(parsed.options.strict).toBe(true)
  }))

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
  await FS.chmod(manifest, 0o644)
  await FS.writeFile(manifest, '{}')
  await Tests.rejects(ManagedModules.readManagedModules(fixture.input), ManagedModuleManifestDriftErrorRegx)
  const metadataPath = Path.join(profile, '.tao-managed.json')
  const metadata = Json.Parse(await FS.readFile(metadataPath, 'utf8')) as ManagedModuleFixtureRecord
  const currentRequirements = metadata.requirements
  metadata.requirements = [['Modules', 'date-fns', '4.1.0']]
  await FS.chmod(metadataPath, 0o644)
  await FS.writeFile(metadataPath, `${Json.Print(metadata)}${NewlineCharacter}`)
  await Tests.rejects(ManagedModules.readManagedModules(fixture.input), ManagedModuleDependenciesChangedErrorRegx)
  metadata.requirements = currentRequirements
  metadata.target = 'tampered'
  await FS.writeFile(metadataPath, `${Json.Print(metadata)}${NewlineCharacter}`)
  await Tests.rejects(ManagedModules.readManagedModules(fixture.input), ManagedModuleDependenciesChangedErrorRegx)
  const repaired = await ManagedModules.repairManagedModuleFiles(fixture.input, fixture.executor)
  Tests.expect(repaired.fingerprint).toBe(fingerprint)
  Tests.expect(fixture.frozen()).toBe(true)
  Tests.expect(await FS.readFile(manifest, 'utf8')).toContain('date-fns')
  Tests.expect(await ManagedModules.readManagedModules(fixture.input)).toEqual(repaired)
}

async function assertPackageResolutionStaysInProfile(profile: string): Promise<void> {
  const packageDirectory = Path.join(profile, 'node_modules', 'events')
  await FS.mkdir(packageDirectory)
  await FS.writeFile(
    Path.join(packageDirectory, 'package.json'),
    '{"name":"events","version":"3.3.0"}' + NewlineCharacter,
  )
  Tests.expect(FS.resolvePackageDirectory('events', profile)).toBe(packageDirectory)
  Tests.expect(FS.resolvePackageDirectory('missing-package', profile)).toBe(undefined)
}

async function assertPrepared(fixture: Fixtures.ManagedFixture): Promise<ManagedModuleTypes.PreparedManagedModules> {
  const prepared = await ManagedModules.prepareManagedModules(fixture.input, fixture.executor)
  Tests.expect(prepared.fingerprint).toBe((await ManagedModules.readManagedModules(fixture.input)).fingerprint)
  Tests.expect(await FS.exists(Path.join(fixture.moduleDirectory, 'node_modules', 'date-fns'))).toBe(true)
  const dependencies = (Json.Parse(
    await FS.readFile(Path.join(fixture.moduleDirectory, 'package.json'), 'utf8'),
  ) as ManagedModuleFixtureRecord)
    .dependencies
  Tests.expect(dependencies).toEqual({ 'react': '19.1.0', 'date-fns': '4.1.0' })
  return prepared
}

async function assertDriftAndRepair(fixture: Fixtures.ManagedFixture): Promise<void> {
  const gitignore = Path.join(fixture.moduleDirectory, '.gitignore')
  const authoredIgnore = await FS.readFile(gitignore, 'utf8')
  Tests.expect(authoredIgnore).toContain('# authored\nlocal.txt\n')
  Tests.expect(authoredIgnore).toContain('# tao-managed-sidecars:begin')
  const tsconfig = Path.join(fixture.moduleDirectory, 'tsconfig.json')
  await FS.chmod(tsconfig, 0o644)
  await FS.writeFile(tsconfig, '{}')
  Tests.expect(await ManagedModules.inspectGeneratedModuleFiles(fixture.input)).toHaveLength(1)
  await FS.writeFile(gitignore, authoredIgnore.replace('/node_modules/', '/changed/'))
  Tests.expect(await ManagedModules.inspectGeneratedModuleFiles(fixture.input)).toHaveLength(2)
  await ManagedModules.repairManagedModuleFiles(fixture.input, fixture.executor)
  Tests.expect(await ManagedModules.inspectGeneratedModuleFiles(fixture.input)).toEqual([])
}

async function assertFrozenReuseAndClean(fixture: Fixtures.ManagedFixture, fingerprint: string): Promise<void> {
  const profile = Path.join(fixture.directory, '.tao', 'cache', 'managed-modules', fingerprint)
  await FS.rm(Path.join(profile, 'node_modules'), { recursive: true, force: true })
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
  Tests.expect(await FS.exists(lock.replace(ManagedNpmLockSuffixRegx, '.sha256'))).toBe(true)
  await FS.chmod(lock, 0o644)
  await FS.writeFile(lock, 'tampered')
  await Tests.rejects(ManagedModules.readManagedModules(fixture.input), ManagedNpmLockChangedErrorRegx)
  await ManagedModules.cleanManagedModuleMetadata(fixture.externalModule)
  Tests.expect(await FS.exists(Path.join(fixture.externalModule, 'package.json'))).toBe(true)
  await FS.rm(profile, { recursive: true, force: true })
  await ManagedModules.cleanManagedModuleMetadata(fixture.directory, [fixture.externalModule])
  await assertCleanupPreservesUserFiles(fixture)
}

async function assertCleanupPreservesUserFiles(fixture: Fixtures.ManagedFixture): Promise<void> {
  Tests.expect(await FS.exists(Path.join(fixture.moduleDirectory, 'package.json'))).toBe(false)
  Tests.expect(await FS.readdir(Path.join(fixture.moduleDirectory, 'node_modules'))).toEqual([])
  Tests.expect(await FS.exists(Path.join(fixture.externalModule, 'package.json'))).toBe(false)
  Tests.expect(await FS.exists(Path.join(fixture.externalModule, 'node_modules', 'react'))).toBe(false)
  Tests.expect(await FS.exists(Path.join(fixture.directory, 'Other', 'package.json'))).toBe(true)
}

Tests.test('checks a foreign view contract with the installed TypeScript compiler', async () => {
  await Fixtures.withTemporaryDirectory('foreign-view', async directory => await assertForeignView(directory))
})

async function assertForeignView(directory: string): Promise<void> {
  await FS.mkdir(Path.join(directory, 'node_modules', '@types', 'react'))
  await FS.writeFile(Path.join(directory, 'tsconfig.json'), foreignViewTsconfig())
  await FS.writeFile(
    Path.join(directory, 'Card.ts'),
    'export function Card(props: { title: string }): unknown { return props.title }',
  )
  await FS.writeFile(
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
  Tests.expect(await FS.exists(file)).toBe(true)
}

function foreignViewTsconfig(): string {
  return Json.Print({
    compilerOptions: { strict: true, noEmit: true, moduleResolution: 'Bundler', module: 'ESNext' },
    include: ['**/*.ts'],
  })
}

async function executeCompiler(command: string, args: readonly string[], cwd: string) {
  return {
    status: 0,
    stdout: await Exec.captureStdout(command, args, { cwd }),
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

// Authored fixture output is inspected and deliberately damaged by these tests.
type ManagedModuleFixtureRecord = Record<string, unknown>
