import { Errors, Try } from '@shared'
import { Env } from '@shared/os'
import { Files, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import type { ProjectPipelineServices } from '../workspace-src/ProjectPipeline'
import * as ProjectPreparation from '../workspace-src/ProjectPreparation'
import { cleanProject } from '../workspace-src/projects/Clean'
import { initializeProject } from '../workspace-src/projects/Projects'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'
import { prepareSidecarPipeline } from '../workspace-src/SidecarPipeline'
import type { BunExecutor } from '../workspace-src/sidecars/ManagedModules'
import { inspectGeneratedModuleFiles, readManagedModules } from '../workspace-src/sidecars/ManagedModules'
import { openAutomaticWorkspace } from './managed-fixtures/AutomaticWorkflow'
import * as ManagedDependencyRegistry from './ManagedDependencyRegistry'

const runtimePins = { react: '0.0.0-tao-fixture' }
const ManagedDependencyInstallFailureRegx = /could not be prepared.*fixture install interruption/
const PackageEntryJavaScriptPathRegx = /index\.js$/
const GeneratedForeignViewImportRegx = /import\s+\{\s*Widget as _taoForeignView\d+\s*\}\s+from\s+("(?:[^"\\]|\\.)*")/
const GeneratedDependencyFilesDriftRegx = /drifted|Generated dependency files changed/
const IncompatibleReactVersionRegx = /incompatible versions of react/

Tests.test('managed npm preparation resolves a local project foreign view through an isolated registry', async () => {
  const root = ArtifactsRoot()
  const requests: string[] = []
  const workspaceHandles: Awaited<ReturnType<typeof openProjectWorkspace>>[] = []
  await FileSystem.mkdir(root, { recursive: true })
  await Try(async () => {
    const { app, ui, entry } = await createFixtureProjects(root)
    const { packages: artifacts, server } = await ManagedDependencyRegistry.startManagedDependencyRegistry(
      root,
      requests,
      runtimePins.react,
    )
    await Try(async () => {
      const registry = `http://127.0.0.1:${server.port}`
      await expectInstallRetry(entry, root)
      const published: string[] = []
      const workspace = await openAutomaticWorkspace(
        entry,
        published,
        createBunExecutor(root, registry),
        runtimePins,
        pipelineServices(),
      )
      await verifyInstalledGraph(app, ui, artifacts, registry)
      workspaceHandles.push(workspace)
      await verifyCompiledSidecar(workspace, entry, ui, published)
      await verifyRuntimeConflictPreservesPreview(workspace, entry, ui, published)
      await verifyLastGoodSurvivesDrift(workspace, entry, ui, published)
      await workspace.dispose()
      workspaceHandles.length = 0
      await verifyFrozenReprepare(app, entry, root, registry)
      verifyRegistryRequests(requests, registry)
      Tests.expect(await FileSystem.exists(Path.join(app, '.tao/store/npm'))).toBe(true)
    }, { finally: () => server.stop(true) })
  }, {
    async finally() {
      for (const workspace of workspaceHandles) {
        await workspace.dispose()
      }
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

type FixtureProjects = { app: string; ui: string; entry: string }

async function createFixtureProjects(root: string): Promise<FixtureProjects> {
  const app = Path.join(root, 'app')
  const ui = Path.join(root, 'ui')
  const fixtures = Repo.resolvePath('ts/0-workspace/workspace-test/managed-fixtures')
  await initializeProject(app)
  await initializeProject(ui)
  await FileSystem.cp(Path.join(fixtures, 'app'), app, { recursive: true })
  await FileSystem.cp(Path.join(fixtures, 'ui'), ui, { recursive: true })
  await FileSystem.rename(Path.join(ui, '@ui/Widget.fixture'), Path.join(ui, '@ui/Widget.tsx'))
  await FileSystem.writeFile(Path.join(app, 'Unused.tao'), 'requires github:unused/project version v1 as unused\n')
  return { app, ui, entry: Path.join(app, 'Main.tao') }
}

async function expectInstallRetry(entry: string, root: string): Promise<void> {
  await Tests.rejects(
    ProjectPreparation.prepareProject(entry, {
      runtimePins,
      executor: async (_command, args) =>
        args[0] === '--version'
          ? { status: 0, stdout: `${Platform.runtimeVersion()}\n`, stderr: '' }
          : { status: 1, stdout: '', stderr: 'fixture install interruption' },
    }),
    ManagedDependencyInstallFailureRegx,
  )
  Tests.expect(await FileSystem.readdir(Path.join(root, 'app/.tao/store/npm'))).toEqual([])
}

function createBunExecutor(root: string, registry: string): BunExecutor {
  return async (command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: `${Platform.runtimeVersion()}\n`, stderr: '' }
    }
    const registryArguments = ['--registry', registry]
    const child = Platform.spawn([command, ...args, ...registryArguments], {
      cwd,
      env: {
        ...Env.snapshot(),
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
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Platform.readText(child.stdout),
      Platform.readText(child.stderr),
    ])
    const lockExists = await FileSystem.exists(Path.join(cwd, 'bun.lock'))
    return lockExists || status !== 0
      ? { status, stdout, stderr }
      : { status: 1, stdout, stderr: `${stderr}\nBun exited successfully without writing bun.lock. ${stdout}` }
  }
}

async function verifyInstalledGraph(
  app: string,
  ui: string,
  packages: RegistryPackages,
  registry: string,
): Promise<void> {
  const entry = FileSystem.resolveModule('tao-fixture-label', Path.join(ui, '@ui'))
  const react = FileSystem.resolveModule('react', Path.join(ui, '@ui'))
  Tests.expect(await FileSystem.readFile(entry, 'utf8')).toContain('label:')
  Tests.expect(await FileSystem.readFile(react.replace(PackageEntryJavaScriptPathRegx, 'package.json'), 'utf8'))
    .toContain(runtimePins.react)
  const profiles = await FileSystem.readdir(Path.join(app, '.tao/cache/managed-modules'))
  const lock = await FileSystem.readFile(Path.join(app, '.tao/cache/managed-modules', profiles[0]!, 'bun.lock'), 'utf8')
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

function pipelineServices(): ProjectPipelineServices {
  return {
    buildManagedInput: async (root, program) =>
      ProjectPreparation.buildManagedModulesInput(root, program.modules, runtimePins),
    readManaged: readManagedModules,
    inspectGeneratedFiles: inspectGeneratedModuleFiles,
    prepareSidecars: prepareSidecarPipeline,
  }
}

async function verifyCompiledSidecar(
  workspace: Awaited<ReturnType<typeof openProjectWorkspace>>,
  entry: string,
  ui: string,
  published: string[],
): Promise<void> {
  const initial = await workspace.files.openFile(entry)
  const result = resolveOpenFileOutcome(initial)
  Tests.expect(result).toBe('published')
  Tests.expect(published).toHaveLength(2)
  Tests.expect(published[0]).toContain('foreign-views')
  Tests.expect(FileSystem.resolveModule('react', Path.join(ui, '@ui'))).toContain('node_modules/react')
  const importPath = GeneratedForeignViewImportRegx.exec(published[0]!)
  Tests.expect(importPath).not.toBeNull()
  const modulePath = JSON.parse(importPath![1]!) as string
  const module = Platform.loadModule<{ Widget(props: { Value: string }): unknown }>(modulePath)
  Tests.expect(module.Widget({ Value: 'acceptance' })).toBe('label:acceptance')
}

type WorkspaceOpenFileResult = Awaited<
  ReturnType<Awaited<ReturnType<typeof openProjectWorkspace>>['files']['openFile']>
>

function resolveOpenFileOutcome(result: WorkspaceOpenFileResult): string {
  if (result.status === 'published') {
    return 'published'
  }
  if ('error' in result) {
    return result.error
  }
  return result.status
}

async function verifyFrozenReprepare(app: string, entry: string, root: string, registry: string): Promise<void> {
  const store = Path.join(app, '.tao/store/npm')
  const lockName = (await FileSystem.readdir(store))[0]!
  const lockPath = Path.join(store, lockName)
  const lockBefore = await FileSystem.readFile(lockPath)
  await cleanProject(app)
  const invocations: string[][] = []
  let versionLookups = 0
  const executor: BunExecutor = async (command, args, cwd) => {
    if (args[0] === '--version') {
      versionLookups += 1
      return { status: 0, stdout: `${Platform.runtimeVersion()}\n`, stderr: '' }
    }
    invocations.push([...args])
    return createBunExecutor(root, registry)(command, args, cwd)
  }
  await ProjectPreparation.prepareProject(entry, { executor, runtimePins, repair: true })
  Tests.expect(invocations.some(args => args.includes('--frozen-lockfile'))).toBe(true)
  Tests.expect(versionLookups).toBe(1)
  Tests.expect(await FileSystem.readFile(lockPath)).toEqual(lockBefore)
}

async function verifyLastGoodSurvivesDrift(
  workspace: Awaited<ReturnType<typeof openProjectWorkspace>>,
  entry: string,
  ui: string,
  published: string[],
): Promise<void> {
  const lastGood = workspace.lastGoodRevision
  await FileSystem.writeFile(
    Path.join(ui, '@ui/Widget.tsx'),
    "import { label } from 'tao-fixture-label'\nexport function Widget({ Value }: { Value: number }) { return label(String(Value)) }\n",
  )
  const contractFailure = await workspace.files.openFile(entry)
  Tests.expect(contractFailure.status).toBe('failed')
  Tests.expect(workspace.lastGoodRevision).toBe(lastGood)
  await FileSystem.writeFile(
    Path.join(ui, '@ui/Widget.tsx'),
    "import { label } from 'tao-fixture-label'\nexport function Widget() { return label('fixture-rendered') }\n",
  )
  Tests.expect((await workspace.files.openFile(entry)).status).toBe('published')
  const repaired = workspace.lastGoodRevision
  const publishedCount = published.length
  Tests.expect(publishedCount).toBeGreaterThan(1)
  const moduleConfig = Path.join(ui, '@ui/tsconfig.json')
  await Files.withWritableFile(moduleConfig, file => file.write('{ drifted }\n'))
  const driftFailure = await workspace.files.openFile(entry)
  Tests.expect(driftFailure.status).toBe('published')
  Tests.expect(workspace.lastGoodRevision).not.toBe(repaired)
  Tests.expect(published).toHaveLength(publishedCount + 1)
  await Tests.rejects(
    ProjectPreparation.inspectProjectPreparation(entry, { runtimePins }),
    GeneratedDependencyFilesDriftRegx,
  )
}

async function verifyRuntimeConflictPreservesPreview(
  workspace: Awaited<ReturnType<typeof openProjectWorkspace>>,
  entry: string,
  ui: string,
  published: string[],
): Promise<void> {
  const path = Path.join(ui, '@ui/Widget.tao')
  const source = await FileSystem.readFile(path, 'utf8')
  const lastGood = workspace.lastGoodRevision
  const publishedCount = published.length
  await FileSystem.writeFile(path, `${source}\nrequires npm:react version 1.0.0\n`)
  await Tests.rejects(
    ProjectPreparation.prepareProject(entry, {
      runtimePins,
      executor: async () => Errors.ThrowShouldNeverHappen('A runtime conflict must fail before invoking Bun.'),
    }),
    IncompatibleReactVersionRegx,
  )
  Tests.expect((await workspace.files.openFile(entry)).status).toBe('failed')
  Tests.expect(workspace.lastGoodRevision).toBe(lastGood)
  Tests.expect(published).toHaveLength(publishedCount)
  await FileSystem.writeFile(path, source)
}

type RegistryPackages = Awaited<ReturnType<typeof ManagedDependencyRegistry.startManagedDependencyRegistry>>['packages']

function ArtifactsRoot(): string {
  return Repo.resolvePath('.artifacts/tmp', `managed-dependencies-${Platform.randomUUID()}`)
}
