import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { prepareManagedModules, readManagedModules, repairManagedModuleFiles } from '../sidecars/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../sidecars/ManagedModuleTypes'

Tests.test('updates one consumer graph while preserving prior profiles and rejecting authored drift', async () =>
  await withDirectory('managed-transition', async root => await assertProfileTransition(root)))

Tests.test('rejects a second consumer graph for a live module without rewiring it', async () =>
  await withDirectory('managed-consumers', async root => await assertConsumerConflict(root)))

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
  const durableLock = Path.join(root, '.tao', 'store', 'npm', `${first.fingerprint}.lock`)
  const lockBytes = await FileSystem.readFile(durableLock, 'utf8')
  const sentinel = Path.join(first.packageDirectory, 'node_modules', '.host-a-sentinel')
  await FileSystem.writeFile(sentinel, 'keep')
  await prepareManagedModules(input, executor)
  Tests.expect(await FileSystem.readFile(sentinel, 'utf8')).toBe('keep')
  const otherHost = { ...input, hostIdentity: { os: 'host-b', architecture: 'x64' } }
  await Tests.rejects(readManagedModules(otherHost), /belongs to .*host is .*Run tao prepare/)
  const rebuiltProfile = await prepareManagedModules(otherHost, executor)
  Tests.expect(rebuiltProfile.fingerprint).toBe(first.fingerprint)
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
