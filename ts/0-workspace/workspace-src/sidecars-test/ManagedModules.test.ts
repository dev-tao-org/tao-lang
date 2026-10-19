import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { checkForeignViewContract } from '../sidecars/ForeignViewContracts'
import {
  cleanManagedModuleMetadata,
  generatedModuleFiles,
  prepareManagedModules,
  readManagedModules,
  repairManagedModuleFiles,
} from '../sidecars/ManagedModules'
import type { BunExecutor, ManagedModulesInput, PreparedManagedModules } from '../sidecars/ManagedModuleTypes'

Tests.test('prepares a deterministic isolated Bun graph and reads it only for matching declarations', async () =>
  await withManagedFixture(async fixture => {
    const prepared = await assertPrepared(fixture)
    await assertProfileRepair(fixture, prepared.fingerprint)
    await assertDriftAndRepair(fixture)
    await assertFrozenReuseAndClean(fixture, prepared.fingerprint)
  }))

type ManagedFixture = {
  directory: string
  moduleDirectory: string
  externalModule: string
  input: ManagedModulesInput
  executor: BunExecutor
  frozen: () => boolean
}

async function assertProfileRepair(fixture: ManagedFixture, fingerprint: string): Promise<void> {
  const profile = Path.join(fixture.directory, '.tao', 'cache', 'managed-modules', fingerprint)
  await assertPackageResolutionStaysInProfile(profile)
  const manifest = Path.join(profile, 'package.json')
  await FileSystem.chmod(manifest, 0o644)
  await FileSystem.writeFile(manifest, '{}')
  await Tests.rejects(readManagedModules(fixture.input), /manifest drifted/)
  const metadataPath = Path.join(profile, '.tao-managed.json')
  const metadata = JSON.parse(await FileSystem.readFile(metadataPath, 'utf8'))
  metadata.target = 'tampered'
  await FileSystem.chmod(metadataPath, 0o644)
  await FileSystem.writeFile(metadataPath, `${JSON.stringify(metadata)}\n`)
  await Tests.rejects(readManagedModules(fixture.input), /dependencies changed/)
  const repaired = await repairManagedModuleFiles(fixture.input, fixture.executor)
  Tests.expect(repaired.fingerprint).toBe(fingerprint)
  Tests.expect(fixture.frozen()).toBe(true)
  Tests.expect(await FileSystem.readFile(manifest, 'utf8')).toContain('date-fns')
  Tests.expect(await readManagedModules(fixture.input)).toEqual(repaired)
}

async function assertPackageResolutionStaysInProfile(profile: string): Promise<void> {
  const packageDirectory = Path.join(profile, 'node_modules', 'events')
  await FileSystem.mkdir(packageDirectory, { recursive: true })
  await FileSystem.writeFile(Path.join(packageDirectory, 'package.json'), '{"name":"events","version":"3.3.0"}\n')
  Tests.expect(FileSystem.resolvePackageDirectory('events', profile)).toBe(packageDirectory)
  Tests.expect(FileSystem.resolvePackageDirectory('missing-package', profile)).toBe(undefined)
}

async function withManagedFixture(action: (fixture: ManagedFixture) => Promise<void>): Promise<void> {
  const fixture = await createManagedFixture()
  await Try(() => action(fixture), {
    async finally() {
      await FileSystem.rm(fixture.directory, { recursive: true, force: true })
      await FileSystem.rm(fixture.externalModule, { recursive: true, force: true })
    },
  })
}

async function createManagedFixture(): Promise<ManagedFixture> {
  const directory = Artifacts.resolvePath('tmp', `managed-modules-${Platform.randomUUID()}`)
  const moduleDirectory = Path.join(directory, 'Modules')
  const externalModule = Artifacts.resolvePath('tmp', `external-module-${Platform.randomUUID()}`)
  await FileSystem.mkdir(moduleDirectory, { recursive: true })
  await FileSystem.mkdir(externalModule, { recursive: true })
  await FileSystem.mkdir(Path.join(directory, '.tao'), { recursive: true })
  await FileSystem.mkdir(Path.join(externalModule, '.tao'), { recursive: true })
  await FileSystem.mkdir(Path.join(directory, 'Other'), { recursive: true })
  await FileSystem.writeFile(Path.join(moduleDirectory, '.gitignore'), '# authored\nlocal.txt\n')
  await FileSystem.writeFile(Path.join(directory, 'Other', 'package.json'), '{"name":"user-owned"}\n')
  const state = { frozen: false }
  return {
    directory,
    moduleDirectory,
    externalModule,
    input: managedInput(directory, moduleDirectory, externalModule),
    executor: fixtureExecutor(state),
    frozen: () => state.frozen,
  }
}

function managedInput(directory: string, moduleDirectory: string, externalModule: string): ManagedModulesInput {
  return {
    directory,
    modules: [
      {
        directory: moduleDirectory,
        requirements: [{ name: 'date-fns', version: '4.1.0', origin: 'Modules/Date.tao' }],
      },
      { directory: externalModule, requirements: [] },
    ],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
}

function fixtureExecutor(state: { frozen: boolean }): BunExecutor {
  return async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0\n', stderr: '' }
    }
    Tests.expect(args).toContain('install')
    state.frozen ||= args.includes('--frozen-lockfile')
    await writeFixtureLock(cwd)
    await writePackage(cwd, 'react', '19.1.0')
    await writePackage(cwd, 'date-fns', '4.1.0')
    return { status: 0, stdout: '', stderr: '' }
  }
}

async function writeFixtureLock(root: string): Promise<void> {
  const path = Path.join(root, 'bun.lock')
  if (await FileSystem.exists(path)) {
    return
  }
  await writeLock(root, { react: '19.1.0', 'date-fns': '4.1.0' })
}

async function assertPrepared(fixture: ManagedFixture): Promise<PreparedManagedModules> {
  const prepared = await prepareManagedModules(fixture.input, fixture.executor)
  Tests.expect(prepared.fingerprint).toBe((await readManagedModules(fixture.input)).fingerprint)
  Tests.expect(await FileSystem.exists(Path.join(fixture.moduleDirectory, 'node_modules', 'date-fns'))).toBe(true)
  const dependencies = JSON.parse(await FileSystem.readFile(Path.join(fixture.moduleDirectory, 'package.json'), 'utf8'))
    .dependencies
  Tests.expect(dependencies).toEqual({ react: '19.1.0', 'date-fns': '4.1.0' })
  return prepared
}

async function assertDriftAndRepair(fixture: ManagedFixture): Promise<void> {
  const gitignore = Path.join(fixture.moduleDirectory, '.gitignore')
  const authoredIgnore = await FileSystem.readFile(gitignore, 'utf8')
  Tests.expect(authoredIgnore).toContain('# authored\nlocal.txt\n')
  Tests.expect(authoredIgnore).toContain('# tao-managed-sidecars:begin')
  const tsconfig = Path.join(fixture.moduleDirectory, 'tsconfig.json')
  await FileSystem.chmod(tsconfig, 0o644)
  await FileSystem.writeFile(tsconfig, '{}')
  Tests.expect(await generatedModuleFiles(fixture.input)).toHaveLength(1)
  await FileSystem.writeFile(gitignore, authoredIgnore.replace('/node_modules/', '/changed/'))
  Tests.expect(await generatedModuleFiles(fixture.input)).toHaveLength(2)
  await repairManagedModuleFiles(fixture.input, fixture.executor)
  Tests.expect(await generatedModuleFiles(fixture.input)).toEqual([])
}

async function assertFrozenReuseAndClean(fixture: ManagedFixture, fingerprint: string): Promise<void> {
  const profile = Path.join(fixture.directory, '.tao', 'cache', 'managed-modules', fingerprint)
  await FileSystem.rm(Path.join(profile, 'node_modules'), { recursive: true, force: true })
  await prepareManagedModules(fixture.input, fixture.executor)
  Tests.expect(fixture.frozen()).toBe(true)
  await Tests.rejects(readManagedModules({ ...fixture.input, modules: [] }), /changed/)
  const lock = Path.join(
    fixture.directory,
    '.tao',
    'store',
    'npm',
    `${(await readManagedModules(fixture.input)).graphFingerprint}.lock`,
  )
  Tests.expect(await FileSystem.exists(lock.replace(/\.lock$/, '.sha256'))).toBe(true)
  await FileSystem.chmod(lock, 0o644)
  await FileSystem.writeFile(lock, 'tampered')
  await Tests.rejects(readManagedModules(fixture.input), /durable lock is changed/)
  await cleanManagedModuleMetadata(fixture.externalModule)
  Tests.expect(await FileSystem.exists(Path.join(fixture.externalModule, 'package.json'))).toBe(true)
  await FileSystem.rm(profile, { recursive: true, force: true })
  await cleanManagedModuleMetadata(fixture.directory, [fixture.externalModule])
  await assertCleanupPreservesUserFiles(fixture)
}

async function assertCleanupPreservesUserFiles(fixture: ManagedFixture): Promise<void> {
  Tests.expect(await FileSystem.exists(Path.join(fixture.moduleDirectory, 'package.json'))).toBe(false)
  Tests.expect(await FileSystem.readdir(Path.join(fixture.moduleDirectory, 'node_modules'))).toEqual([])
  Tests.expect(await FileSystem.exists(Path.join(fixture.externalModule, 'package.json'))).toBe(false)
  Tests.expect(await FileSystem.exists(Path.join(fixture.externalModule, 'node_modules', 'react'))).toBe(false)
  Tests.expect(await FileSystem.exists(Path.join(fixture.directory, 'Other', 'package.json'))).toBe(true)
}

Tests.test('checks a foreign view contract with the installed TypeScript compiler', async () => {
  await withTemporaryDirectory('foreign-view', async directory => await assertForeignView(directory))
})

async function assertForeignView(directory: string): Promise<void> {
  await FileSystem.mkdir(Path.join(directory, 'node_modules', '@types', 'react'), { recursive: true })
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
  await withTemporaryDirectory('managed-peers', async directory => await assertPeerFailure(directory))
})

async function assertPeerFailure(directory: string): Promise<void> {
  const input = {
    directory,
    modules: [{ directory, requirements: [{ name: 'peer-holder', version: '1.0.0', origin: 'Peer.tao' }] }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
  await Tests.rejects(prepareManagedModules(input, peerExecutor), /peer incompatibility/)
}

const peerExecutor: BunExecutor = async (_command, args, cwd) => {
  if (args[0] === '--version') {
    return { status: 0, stdout: '1.2.0\n', stderr: '' }
  }
  await writeLock(cwd, { react: '19.1.0', 'peer-holder': '1.0.0' })
  await writePackage(cwd, 'react', '19.1.0')
  await writePackage(cwd, 'peer-holder', '1.0.0', { react: '^18' })
  return { status: 0, stdout: '', stderr: '' }
}

Tests.test('rejects duplicate framework resolutions and reports their installed paths', async () => {
  await withTemporaryDirectory('managed-singletons', async directory => await assertSingletonFailure(directory))
})

Tests.test('rejects non-exact module requirements before starting Bun', async () => {
  const input: ManagedModulesInput = {
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
    prepareManagedModules(input, async () => {
      invoked = true
      return { status: 0, stdout: '', stderr: '' }
    }),
    /exact version/,
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
    prepareManagedModules(input, singletonExecutor),
    /incompatible singleton react.*19\.1\.0.*19\.0\.0/,
  )
}

const singletonExecutor: BunExecutor = async (_command, args, cwd) => {
  if (args[0] === '--version') {
    return { status: 0, stdout: '1.2.0\n', stderr: '' }
  }
  await writeLock(cwd, { react: '19.1.0', 'wrapper-a': '1.0.0' })
  await writePackage(cwd, 'react', '19.1.0')
  await writePackage(cwd, 'wrapper-a', '1.0.0', undefined, { react: '^19' })
  await writePackage(Path.join(cwd, 'node_modules', 'wrapper-a'), 'react', '19.0.0')
  return { status: 0, stdout: '', stderr: '' }
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

async function withTemporaryDirectory(
  prefix: string,
  action: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `${prefix}-${Platform.randomUUID()}`)
  await FileSystem.mkdir(directory, { recursive: true })
  await Try(() => action(directory), {
    finally: () => FileSystem.rm(directory, { recursive: true, force: true }),
  })
}

async function writePackage(
  root: string,
  name: string,
  version: string,
  peerDependencies?: Record<string, string>,
  dependencies?: Record<string, string>,
): Promise<void> {
  const directory = Path.join(root, 'node_modules', name)
  await FileSystem.mkdir(directory, { recursive: true })
  await FileSystem.writeFile(
    Path.join(directory, 'package.json'),
    JSON.stringify({ name, version, peerDependencies, dependencies }),
  )
  await FileSystem.writeFile(Path.join(directory, 'index.js'), 'module.exports = {}')
}
