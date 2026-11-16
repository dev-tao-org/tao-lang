import { Errors, NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { Addr } from '@shared/web'
import * as ProjectPreparation from '../workspace-src/ProjectPreparation'
import { cleanProject } from '../workspace-src/projects/Clean'
import { initializeProject } from '../workspace-src/projects/Projects'
import type { BunExecutor } from '../workspace-src/sidecars/ManagedModule/ManagedModules'
import * as ManagedDependencyRegistry from './dependencies.test-fixtures.Registry'

const runtimePins = { react: '0.0.0-tao-fixture' }
const ManagedDependencyInstallFailureRegx = /could not be prepared.*fixture install interruption/
const PackageEntryJavaScriptPathRegx = /index\.js$/
const IncompatibleReactVersionRegx = /incompatible versions of react/

Tests.test('managed npm preparation resolves a local project foreign view through an isolated registry', async () => {
  const root = ArtifactsRoot()
  const requests: string[] = []
  await FS.mkdir(root)
  await Try(async () => {
    const { app, ui, entry } = await createFixtureProjects(root)
    const { packages: artifacts, server } = await ManagedDependencyRegistry.startManagedDependencyRegistry(
      root,
      requests,
      runtimePins.react,
    )
    await Try(async () => {
      const port = server.port ?? Errors.ThrowShouldNeverHappen('Dependency registry did not bind a TCP port.')
      const registry = Addr.localhostUrl(port)
      await expectInstallRetry(entry, root)
      await ProjectPreparation.prepareProject(entry, {
        executor: createBunExecutor(root, registry),
        runtimePins,
      })
      await ProjectPreparation.inspectProjectPreparation(entry, { runtimePins })
      await verifyInstalledGraph(app, ui, artifacts, registry)
      await verifyRuntimeConflict(entry, ui)
      await verifyFrozenReprepare(app, entry, root, registry)
      verifyRegistryRequests(requests, registry)
      Tests.expect(await FS.exists(Path.join(app, '.tao/store/npm'))).toBe(true)
    }, { finally: () => server.stop(true) })
  }, {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

type FixtureProjects = { app: string; ui: string; entry: string }

async function createFixtureProjects(root: string): Promise<FixtureProjects> {
  const app = Path.join(root, 'app')
  const ui = Path.join(root, 'ui')
  const fixtures = Repo.resolvePath('ts/0-workspace/test-workspace/managed-fixtures')
  await initializeProject(app)
  await initializeProject(ui)
  await FS.cp(Path.join(fixtures, 'app'), app, { recursive: true })
  await FS.cp(Path.join(fixtures, 'ui'), ui, { recursive: true })
  await FS.rename(Path.join(ui, '@ui/Widget.fixture'), Path.join(ui, '@ui/Widget.tsx'))
  await FS.writeFile(
    Path.join(app, 'Unused.tao'),
    'requires github:unused/project version v1 as Unused' + NewlineCharacter,
  )
  return { app, ui, entry: Path.join(app, 'Main.tao') }
}

async function expectInstallRetry(entry: string, root: string): Promise<void> {
  await Tests.rejects(
    ProjectPreparation.prepareProject(entry, {
      runtimePins,
      executor: async (_command, args) =>
        args[0] === '--version'
          ? { status: 0, stdout: `${Platform.runtimeVersion()}${NewlineCharacter}`, stderr: '' }
          : { status: 1, stdout: '', stderr: 'fixture install interruption' },
    }),
    ManagedDependencyInstallFailureRegx,
  )
  Tests.expect(await FS.readdir(Path.join(root, 'app/.tao/store/npm'))).toEqual([])
}

function createBunExecutor(root: string, registry: string): BunExecutor {
  return async (command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: `${Platform.runtimeVersion()}${NewlineCharacter}`, stderr: '' }
    }
    const registryArguments = ['--registry', registry]
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
    const child = Exec.spawn(command, [...args, ...registryArguments], { cwd, addEnv })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Exec.readText(child.stdout),
      Exec.readText(child.stderr),
    ])
    const lockExists = await FS.exists(Path.join(cwd, 'bun.lock'))
    return lockExists || status !== 0
      ? { status, stdout, stderr }
      : {
        status: 1,
        stdout,
        stderr: `${stderr}${NewlineCharacter}Bun exited successfully without writing bun.lock. ${stdout}`,
      }
  }
}

type RegistryPackages = ManagedDependencyRegistry.ManagedDependencyRegistryPackages
async function verifyInstalledGraph(
  app: string,
  ui: string,
  packages: RegistryPackages,
  registry: string,
): Promise<void> {
  const entry = FS.resolveModule('tao-fixture-label', Path.join(ui, '@ui'))
  const react = FS.resolveModule('react', Path.join(ui, '@ui'))
  Tests.expect(await FS.readFile(entry, 'utf8')).toContain('label:')
  Tests.expect(await FS.readFile(react.replace(PackageEntryJavaScriptPathRegx, 'package.json'), 'utf8'))
    .toContain(runtimePins.react)
  const profiles = await FS.readdir(Path.join(app, '.tao/cache/managed-modules'))
  const lock = await FS.readFile(Path.join(app, '.tao/cache/managed-modules', profiles[0]!, 'bun.lock'), 'utf8')
  Tests.expect(lock).toContain(`sha512-${packages.get('tao-fixture-label')!.integrity}`)
  Tests.expect(lock).toContain(`string-width@4.1.0`)
  Tests.expect(lock).toContain(`sha512-${packages.get('string-width')!.integrity}`)
  Tests.expect(lock).toContain(registry)
}

function verifyRegistryRequests(requests: string[], registry: string): void {
  Tests.expect(requests.some(path => path.includes('/tao-fixture-label'))).toBe(true)
  Tests.expect(requests.some(path => path.includes('/string-width'))).toBe(true)
  Tests.expect(requests.some(path => path.includes('/react'))).toBe(true)
  Tests.expect(requests.some(path => path.includes('/tarballs/tao-fixture-label.tgz'))).toBe(true)
  Tests.expect(requests.some(path => path.includes('/tao-unused-fixture'))).toBe(false)
  Tests.expect(requests.every(path => path.startsWith(registry))).toBe(true)
}

async function verifyFrozenReprepare(app: string, entry: string, root: string, registry: string): Promise<void> {
  const store = Path.join(app, '.tao/store/npm')
  const lockName = (await FS.readdir(store))[0]!
  const lockPath = Path.join(store, lockName)
  const lockBefore = await FS.readFile(lockPath)
  await cleanProject(app)
  const invocations: string[][] = []
  let versionLookups = 0
  const executor: BunExecutor = async (command, args, cwd) => {
    if (args[0] === '--version') {
      versionLookups += 1
      return { status: 0, stdout: `${Platform.runtimeVersion()}${NewlineCharacter}`, stderr: '' }
    }
    invocations.push([...args])
    return createBunExecutor(root, registry)(command, args, cwd)
  }
  await ProjectPreparation.prepareProject(entry, { executor, runtimePins, repair: true })
  Tests.expect(invocations.some(args => args.includes('--frozen-lockfile'))).toBe(true)
  Tests.expect(versionLookups).toBe(1)
  Tests.expect(await FS.readFile(lockPath)).toEqual(lockBefore)
}

async function verifyRuntimeConflict(entry: string, ui: string): Promise<void> {
  const path = Path.join(ui, '@ui/Widget.tao')
  const source = await FS.readFile(path, 'utf8')
  await FS.writeFile(path, `${source}${NewlineCharacter}requires npm:react version 1.0.0${NewlineCharacter}`)
  await Tests.rejects(
    ProjectPreparation.prepareProject(entry, {
      runtimePins,
      executor: async () => Errors.ThrowShouldNeverHappen('A runtime conflict must fail before invoking Bun.'),
    }),
    IncompatibleReactVersionRegx,
  )
  await FS.writeFile(path, source)
}

function ArtifactsRoot(): string {
  return Repo.resolvePath('.artifacts/tmp', `managed-dependencies-${Platform.randomUUID()}`)
}
