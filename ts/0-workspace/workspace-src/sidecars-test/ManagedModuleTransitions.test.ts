import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { prepareManagedModules, readManagedModules, repairManagedModuleFiles } from '../sidecars/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../sidecars/ManagedModuleTypes'

Tests.test('updates one consumer graph while preserving prior profiles and rejecting authored drift', async () =>
  await withDirectory('managed-transition', async root => await assertProfileTransition(root)))

Tests.test('rejects a second consumer graph for a live module without rewiring it', async () =>
  await withDirectory('managed-consumers', async root => await assertConsumerConflict(root)))

Tests.test('serializes concurrent consumers publishing one shared module directory', async () =>
  await withDirectory('managed-consumer-race', async root => await assertConcurrentConsumerRace(root)))

Tests.test('repairs a dangling link recorded by the prior owner profile', async () =>
  await withDirectory('managed-dangling-link', async root => await assertDanglingLinkRepair(root)))

Tests.test('rejects an unowned module path without creating a Tao project marker', async () =>
  await withDirectory('managed-unowned-module', async root => {
    const consumer = Path.join(root, 'consumer')
    const unowned = Path.join(root, 'unowned')
    await FileSystem.mkdir(consumer, { recursive: true })
    await FileSystem.mkdir(unowned, { recursive: true })
    await Tests.rejects(
      prepareManagedModules({
        directory: consumer,
        modules: [{ directory: unowned, requirements: [] }],
        target: 'browser',
        runtimePins: {},
        bunVersion: '1.2.0',
      }, executorFor({})),
      /outside a Tao project/,
    )
    Tests.expect(await FileSystem.exists(Path.join(unowned, '.tao'))).toBe(false)
  }))

Tests.test('rejects unsafe npm package names before starting Bun', async () => {
  let invoked = false
  await Tests.rejects(
    prepareManagedModules({
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
    /package name .*invalid/,
  )
  Tests.expect(invoked).toBe(false)
})

Tests.test('rebuilds a host-specific installed tree from the unchanged durable lock', async () =>
  await withDirectory('managed-host-cache', async root => await assertHostCacheRebuild(root)))

async function assertHostCacheRebuild(root: string): Promise<void> {
  const moduleDirectory = Path.join(root, 'Module')
  await FileSystem.mkdir(moduleDirectory, { recursive: true })
  const input = {
    ...moduleInput(root, moduleDirectory, '4.1.0'),
    hostIdentity: { os: 'host-a', architecture: 'arm64' },
  }
  let rebuilt = false
  const executor: BunExecutor = async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0\n', stderr: '' }
    }
    const nodeModules = Path.join(cwd, 'node_modules')
    if (args.includes('--frozen-lockfile')) {
      if (!await FileSystem.exists(nodeModules)) {
        rebuilt = true
        await writeInstalledPackages(cwd)
      }
      return { status: 0, stdout: '', stderr: '' }
    }
    await writeLock(cwd, { react: '19.1.0', 'date-fns': '4.1.0' })
    await writeInstalledPackages(cwd)
    return { status: 0, stdout: '', stderr: '' }
  }
  const first = await prepareManagedModules(input, executor)
  const durableLock = Path.join(root, '.tao', 'store', 'npm', `${first.graphFingerprint}.lock`)
  const lockBytes = await FileSystem.readFile(durableLock, 'utf8')
  const sentinel = Path.join(first.packageDirectory, 'node_modules', '.host-a-sentinel')
  await FileSystem.writeFile(sentinel, 'keep')
  await prepareManagedModules(input, executor)
  Tests.expect(await FileSystem.readFile(sentinel, 'utf8')).toBe('keep')
  const otherHost = { ...input, hostIdentity: { os: 'host-b', architecture: 'x64' } }
  await Tests.rejects(readManagedModules(otherHost), /Managed npm declarations changed or are not prepared/)
  const rebuiltProfile = await prepareManagedModules(otherHost, executor)
  Tests.expect(rebuiltProfile.fingerprint).not.toBe(first.fingerprint)
  Tests.expect(rebuiltProfile.graphFingerprint).toBe(first.graphFingerprint)
  Tests.expect(rebuilt).toBe(true)
  Tests.expect(await FileSystem.readFile(durableLock, 'utf8')).toBe(lockBytes)
}

async function writeInstalledPackages(root: string): Promise<void> {
  await writePackage(root, 'react', '19.1.0')
  await writePackage(root, 'date-fns', '4.1.0')
}

async function assertProfileTransition(root: string): Promise<void> {
  const moduleDirectory = Path.join(root, 'Modules')
  await FileSystem.mkdir(moduleDirectory, { recursive: true })
  const initial = moduleInput(root, moduleDirectory, '4.1.0')
  const first = await prepareManagedModules(initial, executorFor({ react: '19.1.0', 'date-fns': '4.1.0' }))
  const marker = Path.join(moduleDirectory, '.tao-managed-module.json')
  await migrateLegacyMarker(marker)
  await Tests.rejects(
    prepareManagedModules(initial, executorFor({ react: '19.1.0', 'date-fns': '4.1.0' })),
    /needs repair/,
  )
  await repairManagedModuleFiles(initial, executorFor({ react: '19.1.0', 'date-fns': '4.1.0' }))
  Tests.expect(JSON.parse(await FileSystem.readFile(marker, 'utf8')).generatedHashes).toBeDefined()

  const link = Path.join(moduleDirectory, 'node_modules', 'date-fns')
  const priorLink = FileSystem.realpathSync(link)
  const updated = moduleInput(root, moduleDirectory, '4.2.0')
  const second = await prepareManagedModules(updated, executorFor({ react: '19.1.0', 'date-fns': '4.2.0' }))
  Tests.expect(second.packageDirectory).not.toBe(first.packageDirectory)
  Tests.expect(await FileSystem.exists(first.packageDirectory)).toBe(true)
  Tests.expect(FileSystem.realpathSync(link)).not.toBe(priorLink)
  Tests.expect(FileSystem.realpathSync(link)).toBe(
    FileSystem.realpathSync(Path.join(second.packageDirectory, 'node_modules', 'date-fns')),
  )

  const manifest = Path.join(moduleDirectory, 'package.json')
  await FileSystem.chmod(manifest, 0o644)
  await FileSystem.writeFile(manifest, '{"authored":true}\n')
  const next = moduleInput(root, moduleDirectory, '4.3.0')
  await Tests.rejects(
    prepareManagedModules(next, executorFor({ react: '19.1.0', 'date-fns': '4.3.0' })),
    /metadata drifted/,
  )
  Tests.expect(await FileSystem.readFile(manifest, 'utf8')).toBe('{"authored":true}\n')
  await repairManagedModuleFiles(next, executorFor({ react: '19.1.0', 'date-fns': '4.3.0' }))
  Tests.expect(await FileSystem.readFile(manifest, 'utf8')).toContain('4.3.0')
}

async function assertDanglingLinkRepair(root: string): Promise<void> {
  const moduleDirectory = Path.join(root, 'Modules')
  await FileSystem.mkdir(moduleDirectory, { recursive: true })
  const first = await prepareManagedModules(
    moduleInput(root, moduleDirectory, '4.1.0'),
    executorFor({ react: '19.1.0', 'date-fns': '4.1.0' }),
  )
  const second = await prepareManagedModules(
    moduleInput(root, moduleDirectory, '4.2.0'),
    executorFor({ react: '19.1.0', 'date-fns': '4.2.0' }),
  )
  const link = Path.join(moduleDirectory, 'node_modules', 'date-fns')
  await FileSystem.rm(second.packageDirectory, { recursive: true, force: true })
  Tests.expect(Try.WithDefault(false, () => FileSystem.lstatSync(link).isSymbolicLink())).toBe(true)
  const third = await prepareManagedModules(
    moduleInput(root, moduleDirectory, '4.3.0'),
    executorFor({ react: '19.1.0', 'date-fns': '4.3.0' }),
  )
  Tests.expect(first.packageDirectory).not.toBe(third.packageDirectory)
  Tests.expect(FileSystem.realpathSync(link)).toBe(
    FileSystem.realpathSync(Path.join(third.packageDirectory, 'node_modules', 'date-fns')),
  )
}

async function migrateLegacyMarker(marker: string): Promise<void> {
  const contents = JSON.parse(await FileSystem.readFile(marker, 'utf8'))
  delete contents.generatedHashes
  await FileSystem.chmod(marker, 0o644)
  await FileSystem.writeFile(marker, `${JSON.stringify(contents, null, 2)}\n`)
}

async function assertConsumerConflict(root: string): Promise<void> {
  const sharedModule = Path.join(root, 'Shared')
  const firstRoot = Path.join(root, 'first')
  const secondRoot = Path.join(root, 'second')
  await FileSystem.mkdir(Path.join(root, '.tao'), { recursive: true })
  await FileSystem.mkdir(sharedModule, { recursive: true })
  const firstInput = {
    ...moduleInput(firstRoot, sharedModule, '4.1.0'),
    modules: [{ directory: sharedModule, requirements: [] }],
  }
  await prepareManagedModules(firstInput, executorFor({ react: '19.1.0' }))
  const manifest = await FileSystem.readFile(Path.join(sharedModule, 'package.json'), 'utf8')
  const reactLink = Path.join(sharedModule, 'node_modules', 'react')
  const linkTarget = FileSystem.realpathSync(reactLink)
  const secondInput = { ...firstInput, directory: secondRoot, runtimePins: { react: '18.3.1' } }
  await Tests.rejects(
    prepareManagedModules(secondInput, executorFor({ react: '18.3.1' })),
    /already owned by consumer profile.*one app dependency graph/,
  )
  Tests.expect(await FileSystem.readFile(Path.join(sharedModule, 'package.json'), 'utf8')).toBe(manifest)
  Tests.expect(FileSystem.realpathSync(reactLink)).toBe(linkTarget)
}

async function assertConcurrentConsumerRace(root: string): Promise<void> {
  const sourceRoot = Path.join(root, 'SharedProject')
  const sharedModule = Path.join(sourceRoot, 'Modules', 'Shared')
  await FileSystem.mkdir(Path.join(sourceRoot, '.tao'), { recursive: true })
  await FileSystem.mkdir(sharedModule, { recursive: true })
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let ready = 0
  const executor = (version: string): BunExecutor => async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0\n', stderr: '' }
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
    prepareManagedModules(firstInput, executor('19.1.0')),
    prepareManagedModules(secondInput, executor('18.3.1')),
  ])
  Tests.expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const failure = results.find(result => result.status === 'rejected')!
  Tests.expect(String(failure.status === 'rejected' ? failure.reason : '')).toMatch(/already owned|being updated/)
  const owner = JSON.parse(await FileSystem.readFile(Path.join(sharedModule, '.tao-managed-module.json'), 'utf8'))
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(sharedModule, 'package.json'), 'utf8'))
  const profileManifest = JSON.parse(await FileSystem.readFile(Path.join(owner.profile, 'package.json'), 'utf8'))
  Tests.expect(manifest.dependencies).toEqual(profileManifest.dependencies)
  Tests.expect(FileSystem.realpathSync(Path.join(sharedModule, 'node_modules', 'react'))).toBe(
    FileSystem.realpathSync(Path.join(owner.profile, 'node_modules', 'react')),
  )
}

function moduleInput(root: string, directory: string, version: string): ManagedModulesInput {
  return {
    directory: root,
    modules: [{ directory, requirements: [{ name: 'date-fns', version, origin: 'Modules/Date.tao' }] }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
}

function executorFor(dependencies: Record<string, string>): BunExecutor {
  return async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0\n', stderr: '' }
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

async function writeLock(root: string, dependencies: Record<string, string>): Promise<void> {
  const packages = Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => [
      name,
      [`${name}@${version}`, '', {}, `sha512-${name}`],
    ]),
  )
  await FileSystem.writeFile(
    Path.join(root, 'bun.lock'),
    JSON.stringify({
      lockfileVersion: 1,
      workspaces: { '': { dependencies } },
      packages,
    }),
  )
}

async function writePackage(root: string, name: string, version: string): Promise<void> {
  const directory = Path.join(root, 'node_modules', name)
  await FileSystem.mkdir(directory, { recursive: true })
  await FileSystem.writeFile(Path.join(directory, 'package.json'), JSON.stringify({ name, version }))
  await FileSystem.writeFile(Path.join(directory, 'index.js'), 'module.exports = {}')
}

async function withDirectory(prefix: string, action: (root: string) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `${prefix}-${Platform.randomUUID()}`)
  await FileSystem.mkdir(root, { recursive: true })
  await Try(() => action(root), {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
}
