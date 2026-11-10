import { Json } from '@shared'
import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as ManagedModules from '../../workspace-src/sidecars/ManagedModule/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'
import { writeLock } from './ManagedModule.test-fixtures'

const OutsideTaoProjectErrorRegx = /outside a Tao project/
const InvalidPackageNameErrorRegx = /package name .*invalid/
const ManagedNpmDeclarationsChangedErrorRegx = /Managed npm declarations changed or are not prepared/
const ManagedModuleRepairRequiredErrorRegx = /needs repair/
const ManagedModuleMetadataDriftErrorRegx = /metadata drifted/
const ConsumerProfileOwnershipConflictErrorRegx = /already owned by consumer profile.*one app dependency graph/
const ManagedModuleAlreadyOwnedOrUpdatingErrorRegx = /already owned|being updated/

Tests.test('updates one consumer graph while preserving prior profiles and rejecting authored drift', async () =>
  await withDirectory('managed-transition', async root => await assertProfileTransition(root)))

Tests.test('rejects a second consumer graph for a live module without rewiring it', async () =>
  await withDirectory('managed-consumers', async root => await assertConsumerConflict(root)))

Tests.test('serializes concurrent consumers publishing one shared module directory', async () =>
  await withDirectory('managed-consumer-race', async root => await assertConcurrentConsumerRace(root)))

Tests.test('repairs a dangling link recorded by the prior owner profile', async () =>
  await withDirectory('managed-dangling-link', async root => await assertDanglingLinkRepair(root)))

Tests.test('cleans a mixed-case npm package link recorded by the current owner profile', async () =>
  await withDirectory('managed-mixed-case-cleanup', async root => {
    const moduleDirectory = Path.join(root, 'Modules')
    await FS.mkdir(moduleDirectory)
    const input = createModuleInput(root, moduleDirectory, '1.3.5')
    input.modules[0]!.requirements = [{ name: 'JSONStream', version: '1.3.5', origin: 'Modules/Json.tao' }]
    await ManagedModules.prepareManagedModules(input, createExecutor({ react: '19.1.0', JSONStream: '1.3.5' }))
    const link = Path.join(moduleDirectory, 'node_modules', 'JSONStream')
    Tests.expect(FS.lstatSync(link).isSymbolicLink()).toBe(true)
    await ManagedModules.cleanManagedModuleMetadata(root)
    Tests.expect(await FS.exists(link)).toBe(false)
    Tests.expect(await FS.exists(Path.join(moduleDirectory, '.tao-managed-module.json'))).toBe(false)
  }))

Tests.test('rejects an unowned module path without creating a Tao project marker', async () =>
  await withDirectory('managed-unowned-module', async root => {
    const consumer = Path.join(root, 'consumer')
    const unowned = Path.join(root, 'unowned')
    await FS.mkdirs(consumer, unowned)
    await Tests.rejects(
      ManagedModules.prepareManagedModules({
        directory: consumer,
        modules: [{ directory: unowned, requirements: [] }],
        target: 'browser',
        runtimePins: {},
        bunVersion: '1.2.0',
      }, createExecutor({})),
      OutsideTaoProjectErrorRegx,
    )
    Tests.expect(await FS.exists(Path.join(unowned, '.tao'))).toBe(false)
  }))

Tests.test('rejects unsafe npm package names before starting Bun', async () => {
  let invoked = false
  await Tests.rejects(
    ManagedModules.prepareManagedModules({
      directory: '/unused/project',
      modules: [{
        directory: '/unused/project/Module',
        requirements: [{ name: '../outside', version: '1.0.0', origin: 'Unsafe.tao' }],
      }],
      target: 'browser',
      runtimePins: {},
      bunVersion: '1.2.0',
    }, async () => {
      invoked = true
      return { status: 0, stdout: '', stderr: '' }
    }),
    InvalidPackageNameErrorRegx,
  )
  Tests.expect(invoked).toBe(false)
})

Tests.test('rebuilds a host-specific installed tree from the unchanged durable lock', async () =>
  await withDirectory('managed-host-cache', async root => await assertHostCacheRebuild(root)))

async function assertHostCacheRebuild(root: string): Promise<void> {
  const moduleDirectory = Path.join(root, 'Module')
  await FS.mkdir(moduleDirectory)
  const input = {
    ...createModuleInput(root, moduleDirectory, '4.1.0'),
    hostIdentity: { os: 'host-a', architecture: 'arm64' },
  }
  let rebuilt = false
  const executor: BunExecutor = async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
    }
    const nodeModules = Path.join(cwd, 'node_modules')
    if (args.includes('--frozen-lockfile')) {
      if (!await FS.exists(nodeModules)) {
        rebuilt = true
        await writeInstalledPackages(cwd)
      }
      return { status: 0, stdout: '', stderr: '' }
    }
    await writeLock(cwd, { 'react': '19.1.0', 'date-fns': '4.1.0' })
    await writeInstalledPackages(cwd)
    return { status: 0, stdout: '', stderr: '' }
  }
  const first = await ManagedModules.prepareManagedModules(input, executor)
  const durableLock = Path.join(root, '.tao', 'store', 'npm', `${first.graphFingerprint}.lock`)
  const lockBytes = await FS.readFile(durableLock, 'utf8')
  const sentinel = Path.join(first.packageDirectory, 'node_modules', '.host-a-sentinel')
  await FS.writeFile(sentinel, 'keep')
  await ManagedModules.prepareManagedModules(input, executor)
  Tests.expect(await FS.readFile(sentinel, 'utf8')).toBe('keep')
  const otherHost = { ...input, hostIdentity: { os: 'host-b', architecture: 'x64' } }
  await Tests.rejects(
    ManagedModules.readManagedModules(otherHost),
    ManagedNpmDeclarationsChangedErrorRegx,
  )
  const rebuiltProfile = await ManagedModules.prepareManagedModules(otherHost, executor)
  Tests.expect(rebuiltProfile.fingerprint).not.toBe(first.fingerprint)
  Tests.expect(rebuiltProfile.graphFingerprint).toBe(first.graphFingerprint)
  Tests.expect(rebuilt).toBe(true)
  Tests.expect(await FS.readFile(durableLock, 'utf8')).toBe(lockBytes)
}

async function writeInstalledPackages(root: string): Promise<void> {
  await writePackage(root, 'react', '19.1.0')
  await writePackage(root, 'date-fns', '4.1.0')
}

async function assertProfileTransition(root: string): Promise<void> {
  const moduleDirectory = Path.join(root, 'Modules')
  await FS.mkdir(moduleDirectory)
  const initial = createModuleInput(root, moduleDirectory, '4.1.0')
  const first = await ManagedModules.prepareManagedModules(
    initial,
    createExecutor({ 'react': '19.1.0', 'date-fns': '4.1.0' }),
  )
  const marker = Path.join(moduleDirectory, '.tao-managed-module.json')
  await damageCurrentOwnershipMarker(marker)
  await Tests.rejects(
    ManagedModules.prepareManagedModules(initial, createExecutor({ 'react': '19.1.0', 'date-fns': '4.1.0' })),
    ManagedModuleRepairRequiredErrorRegx,
  )
  await ManagedModules.repairManagedModuleFiles(initial, createExecutor({ 'react': '19.1.0', 'date-fns': '4.1.0' }))
  Tests.expect(
    (Json.Parse(await FS.readFile(marker, 'utf8')) as ManagedTransitionFixtureRecord).generatedHashes,
  ).toBeDefined()

  const link = Path.join(moduleDirectory, 'node_modules', 'date-fns')
  const priorLink = FS.realpathSync(link)
  const updated = createModuleInput(root, moduleDirectory, '4.2.0')
  const second = await ManagedModules.prepareManagedModules(
    updated,
    createExecutor({ 'react': '19.1.0', 'date-fns': '4.2.0' }),
  )
  Tests.expect(second.packageDirectory).not.toBe(first.packageDirectory)
  Tests.expect(await FS.exists(first.packageDirectory)).toBe(true)
  Tests.expect(FS.realpathSync(link)).not.toBe(priorLink)
  Tests.expect(FS.realpathSync(link)).toBe(
    FS.realpathSync(Path.join(second.packageDirectory, 'node_modules', 'date-fns')),
  )

  const manifest = Path.join(moduleDirectory, 'package.json')
  await FS.chmod(manifest, 0o644)
  await FS.writeFile(manifest, '{"authored":true}' + NewlineCharacter)
  const next = createModuleInput(root, moduleDirectory, '4.3.0')
  await Tests.rejects(
    ManagedModules.prepareManagedModules(next, createExecutor({ 'react': '19.1.0', 'date-fns': '4.3.0' })),
    ManagedModuleMetadataDriftErrorRegx,
  )
  Tests.expect(await FS.readFile(manifest, 'utf8')).toBe('{"authored":true}\n')
  await ManagedModules.repairManagedModuleFiles(next, createExecutor({ 'react': '19.1.0', 'date-fns': '4.3.0' }))
  Tests.expect(await FS.readFile(manifest, 'utf8')).toContain('4.3.0')
}

async function assertDanglingLinkRepair(root: string): Promise<void> {
  const moduleDirectory = Path.join(root, 'Modules')
  await FS.mkdir(moduleDirectory)
  const first = await ManagedModules.prepareManagedModules(
    createModuleInput(root, moduleDirectory, '4.1.0'),
    createExecutor({ 'react': '19.1.0', 'date-fns': '4.1.0' }),
  )
  const second = await ManagedModules.prepareManagedModules(
    createModuleInput(root, moduleDirectory, '4.2.0'),
    createExecutor({ 'react': '19.1.0', 'date-fns': '4.2.0' }),
  )
  const link = Path.join(moduleDirectory, 'node_modules', 'date-fns')
  await FS.rm(second.packageDirectory, { recursive: true, force: true })
  Tests.expect(Try.WithDefault(false, () => FS.lstatSync(link).isSymbolicLink())).toBe(true)
  const third = await ManagedModules.prepareManagedModules(
    createModuleInput(root, moduleDirectory, '4.3.0'),
    createExecutor({ 'react': '19.1.0', 'date-fns': '4.3.0' }),
  )
  Tests.expect(first.packageDirectory).not.toBe(third.packageDirectory)
  Tests.expect(FS.realpathSync(link)).toBe(
    FS.realpathSync(Path.join(third.packageDirectory, 'node_modules', 'date-fns')),
  )
}

async function damageCurrentOwnershipMarker(marker: string): Promise<void> {
  const contents = Json.Parse(await FS.readFile(marker, 'utf8')) as ManagedTransitionFixtureRecord
  delete contents.generatedHashes
  await FS.chmod(marker, 0o644)
  await FS.writeFile(marker, `${Json.Print(contents)}${NewlineCharacter}`)
}

async function assertConsumerConflict(root: string): Promise<void> {
  const sharedModule = Path.join(root, 'Shared')
  const firstRoot = Path.join(root, 'first')
  const secondRoot = Path.join(root, 'second')
  await FS.mkdirs(Path.join(root, '.tao'), sharedModule)
  const firstInput = {
    ...createModuleInput(firstRoot, sharedModule, '4.1.0'),
    modules: [{ directory: sharedModule, requirements: [] }],
  }
  await ManagedModules.prepareManagedModules(firstInput, createExecutor({ react: '19.1.0' }))
  const manifest = await FS.readFile(Path.join(sharedModule, 'package.json'), 'utf8')
  const reactLink = Path.join(sharedModule, 'node_modules', 'react')
  const linkTarget = FS.realpathSync(reactLink)
  const secondInput = { ...firstInput, directory: secondRoot, runtimePins: { react: '18.3.1' } }
  await Tests.rejects(
    ManagedModules.prepareManagedModules(secondInput, createExecutor({ react: '18.3.1' })),
    ConsumerProfileOwnershipConflictErrorRegx,
  )
  Tests.expect(await FS.readFile(Path.join(sharedModule, 'package.json'), 'utf8')).toBe(manifest)
  Tests.expect(FS.realpathSync(reactLink)).toBe(linkTarget)
}

async function assertConcurrentConsumerRace(root: string): Promise<void> {
  const sourceRoot = Path.join(root, 'SharedProject')
  const sharedModule = Path.join(sourceRoot, 'Modules', 'Shared')
  await FS.mkdirs(Path.join(sourceRoot, '.tao'), sharedModule)
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let ready = 0
  const executor = (version: string): BunExecutor => async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
    }
    await writeLock(cwd, { react: version })
    await writePackage(cwd, 'react', version)
    ready += 1
    if (ready === 2) {
      release()
    }
    await gate
    return { status: 0, stdout: '', stderr: '' }
  }
  const firstInput = {
    directory: Path.join(root, 'consumer-a'),
    modules: [{ directory: sharedModule, requirements: [] }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
  const secondInput = { ...firstInput, directory: Path.join(root, 'consumer-b'), runtimePins: { react: '18.3.1' } }
  const results = await Promise.allSettled([
    ManagedModules.prepareManagedModules(firstInput, executor('19.1.0')),
    ManagedModules.prepareManagedModules(secondInput, executor('18.3.1')),
  ])
  Tests.expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const failure = results.find(result => result.status === 'rejected')!
  Tests.expect(String(failure.status === 'rejected' ? failure.reason : '')).toMatch(
    ManagedModuleAlreadyOwnedOrUpdatingErrorRegx,
  )
  await assertConsistentPublishedOwner(sharedModule)
}

async function assertConsistentPublishedOwner(sharedModule: string): Promise<void> {
  const owner = Json.Parse(
    await FS.readFile(Path.join(sharedModule, '.tao-managed-module.json'), 'utf8'),
  ) as ManagedTransitionFixtureRecord
  const manifest = Json.Parse(
    await FS.readFile(Path.join(sharedModule, 'package.json'), 'utf8'),
  ) as ManagedTransitionFixtureRecord
  const profileManifest = Json.Parse(
    await FS.readFile(Path.join(owner.profile, 'package.json'), 'utf8'),
  ) as ManagedTransitionFixtureRecord
  Tests.expect(manifest.dependencies).toEqual(profileManifest.dependencies)
  Tests.expect(FS.realpathSync(Path.join(sharedModule, 'node_modules', 'react'))).toBe(
    FS.realpathSync(Path.join(owner.profile, 'node_modules', 'react')),
  )
}

function createModuleInput(root: string, directory: string, version: string): ManagedModulesInput {
  return {
    directory: root,
    modules: [{ directory, requirements: [{ name: 'date-fns', version, origin: 'Modules/Date.tao' }] }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
}

function createExecutor(dependencies: Record<string, string>): BunExecutor {
  return async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
    }
    if (args.includes('--frozen-lockfile')) {
      return { status: 0, stdout: '', stderr: '' }
    }
    await writeLock(cwd, dependencies)
    for (const [name, version] of Object.entries(dependencies)) {
      await writePackage(cwd, name, version)
    }
    return { status: 0, stdout: '', stderr: '' }
  }
}

async function writePackage(root: string, name: string, version: string): Promise<void> {
  const directory = Path.join(root, 'node_modules', name)
  await FS.mkdir(directory)
  await FS.writeFile(Path.join(directory, 'package.json'), Json.Print({ name, version }))
  await FS.writeFile(Path.join(directory, 'index.js'), 'module.exports = {}')
}

async function withDirectory(prefix: string, action: (root: string) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `${prefix}-${Platform.randomUUID()}`)
  await FS.mkdir(root)
  await Try(() => action(root), {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type ManagedTransitionFixtureRecord = {
  profile: string
  generatedHashes: unknown
  dependencies: unknown
  packageHash: unknown
}
