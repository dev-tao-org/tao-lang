import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import type { BunExecutor, ManagedModulesInput } from '../sidecars/managed-modules/ManagedModuleTypes'

/** ManagedFixture holds the paths and executor used by managed module graph tests. */
export type ManagedFixture = {
  directory: string
  moduleDirectory: string
  externalModule: string
  input: ManagedModulesInput
  executor: BunExecutor
  frozen: () => boolean
}

/** withManagedFixture creates and removes an isolated managed module fixture. */
export async function withManagedFixture(action: (fixture: ManagedFixture) => Promise<void>): Promise<void> {
  const fixture = await createManagedFixture()
  await Try(() => action(fixture), {
    async finally() {
      await FileSystem.rm(fixture.directory, { recursive: true, force: true })
      await FileSystem.rm(fixture.externalModule, { recursive: true, force: true })
    },
  })
}

/** withTemporaryDirectory creates and removes an isolated temporary test directory. */
export async function withTemporaryDirectory(
  prefix: string,
  action: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `${prefix}-${Platform.randomUUID()}`)
  await FileSystem.mkdir(directory)
  await Try(() => action(directory), {
    finally: () => FileSystem.rm(directory, { recursive: true, force: true }),
  })
}

/** writeLock writes a fixture Bun lock for the supplied direct dependencies. */
export async function writeLock(root: string, dependencies: Record<string, string>): Promise<void> {
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

/** writePackage writes a fixture installed package with optional dependency metadata. */
export async function writePackage(
  root: string,
  name: string,
  version: string,
  peerDependencies?: Record<string, string>,
  dependencies?: Record<string, string>,
): Promise<void> {
  const directory = Path.join(root, 'node_modules', name)
  await FileSystem.mkdir(directory)
  await FileSystem.writeFile(
    Path.join(directory, 'package.json'),
    JSON.stringify({ name, version, peerDependencies, dependencies }),
  )
  await FileSystem.writeFile(Path.join(directory, 'index.js'), 'module.exports = {}')
}

async function createManagedFixture(): Promise<ManagedFixture> {
  const directory = Artifacts.resolvePath('tmp', `managed-modules-${Platform.randomUUID()}`)
  const moduleDirectory = Path.join(directory, 'Modules')
  const externalModule = Artifacts.resolvePath('tmp', `external-module-${Platform.randomUUID()}`)
  await FileSystem.mkdirs(
    moduleDirectory,
    externalModule,
    Path.join(directory, '.tao'),
    Path.join(externalModule, '.tao'),
    Path.join(directory, 'Other'),
  )
  await FileSystem.writeFile(Path.join(moduleDirectory, '.gitignore'), '# authored\nlocal.txt\n')
  await FileSystem.writeFile(Path.join(directory, 'Other', 'package.json'), '{"name":"user-owned"}\n')
  const state = { frozen: false }
  return {
    directory,
    moduleDirectory,
    externalModule,
    input: buildManagedInput(directory, moduleDirectory, externalModule),
    executor: fixtureExecutor(state),
    frozen: () => state.frozen,
  }
}

function buildManagedInput(directory: string, moduleDirectory: string, externalModule: string): ManagedModulesInput {
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
  await writeLock(root, { 'react': '19.1.0', 'date-fns': '4.1.0' })
}
