import { Addr, Errors, NewlineCharacter, S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Files, FS, Path, Platform, Repo } from '@shared/os'
import { Processes } from '@shared/os'
import type { ProjectPipelineServices } from '../workspace-src/ProjectPipeline'
import * as ProjectPreparation from '../workspace-src/ProjectPreparation'
import { cleanProject } from '../workspace-src/projects/Clean'
import { initializeProject } from '../workspace-src/projects/Projects'
import { prepareSidecarPipeline } from '../workspace-src/SidecarPipeline'
import type { BunExecutor } from '../workspace-src/sidecars/ManagedModule/ManagedModules'
import * as ManagedModules from '../workspace-src/sidecars/ManagedModule/ManagedModules'
import type { UpdateResult, WorkspaceSession } from '../workspace-src/Workspace'
import * as ManagedDependencyRegistry from './dependencies/Dependencies.test-fixtures.Registry'
import { openAutomaticWorkspace } from './Workspace.test-fixtures.AutomaticWorkflow'

const runtimePins = { react: '0.0.0-tao-fixture' }
const ManagedDependencyInstallFailureRegx = /could not be prepared.*fixture install interruption/
const PackageEntryJavaScriptPathRegx = /index\.js$/
const GeneratedForeignViewImportRegx = /import\s+\{\s*Widget as _taoForeignView\d+\s*\}\s+from\s+("(?:[^"\\]|\\.)*")/
const GeneratedDependencyFilesDriftRegx = /drifted|Generated dependency files changed/
const IncompatibleReactVersionRegx = /incompatible versions of react/

Tests.test('managed npm preparation resolves a local project foreign view through an isolated registry', async () => {
  const root = ArtifactsRoot()
  const requests: string[] = []
  const workspaceHandles: WorkspaceSession[] = []
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
      Tests.expect(await FS.exists(Path.join(app, '.tao/store/npm'))).toBe(true)
    }, { finally: () => server.stop(true) })
  }, {
    async finally() {
      for (const workspace of workspaceHandles) {
        await workspace.dispose()
      }
      await FS.rm(root, { recursive: true, force: true })
    },
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
    'requires github:unused/project version v1 as unused' + NewlineCharacter,
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
    const child = Processes.spawnPiped([command, ...args, ...registryArguments], { cwd, addEnv })
    const [status, stdout, stderr] = await Promise.all([
      child.exited,
      Processes.readText(child.stdout),
      Processes.readText(child.stderr),
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

function pipelineServices(): ProjectPipelineServices {
  return {
    buildManagedInput: async (root, program) =>
      ProjectPreparation.buildManagedModulesInput(root, program.modules, runtimePins),
    readManaged: ManagedModules.readManagedModules,
    inspectGeneratedFiles: ManagedModules.inspectGeneratedModuleFiles,
    prepareSidecars: prepareSidecarPipeline,
  }
}

async function verifyCompiledSidecar(
  workspace: WorkspaceSession,
  entry: string,
  ui: string,
  published: string[],
): Promise<void> {
  const initial = await workspace.files.openFile(entry)
  const result = resolveOpenFileOutcome(initial)
  Tests.expect(result).toBe('published')
  Tests.expect(published).toHaveLength(2)
  Tests.expect(published[0]).toContain('foreign-views')
  Tests.expect(FS.resolveModule('react', Path.join(ui, '@ui'))).toContain('node_modules/react')
  const importPath = GeneratedForeignViewImportRegx.exec(published[0]!)
  Tests.expect(importPath).not.toBeNull()
  const modulePath = JSON.parse(importPath![1]!) as string
  const module = Platform.loadModule<{ Widget(props: { Value: string }): unknown }>(modulePath)
  Tests.expect(module.Widget({ Value: 'acceptance' })).toBe('label:acceptance')
}

function resolveOpenFileOutcome(result: UpdateResult): string {
  if (result.status === 'published') {
    return 'published'
  }
  if (hasOpenFileError(result)) {
    return result.error
  }
  return result.status
}

function hasOpenFileError(result: UpdateResult): result is Extract<UpdateResult, { status: 'failed' }> {
  return 'error' in result
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

async function verifyLastGoodSurvivesDrift(
  workspace: WorkspaceSession,
  entry: string,
  ui: string,
  published: string[],
): Promise<void> {
  const lastGood = workspace.lastGoodRevision
  await FS.writeFile(
    Path.join(ui, '@ui/Widget.tsx'),
    Shared.joinTextLines(
      S`
        import { label } from 'tao-fixture-label'
        export function Widget({ Value }: { Value: number }) { return label(String(Value)) }
      `,
      '',
    ),
  )
  const contractFailure = await workspace.files.openFile(entry)
  Tests.expect(contractFailure.status).toBe('failed')
  Tests.expect(workspace.lastGoodRevision).toBe(lastGood)
  await FS.writeFile(
    Path.join(ui, '@ui/Widget.tsx'),
    Shared.joinTextLines(
      S`
        import { label } from 'tao-fixture-label'
        export function Widget() { return label('fixture-rendered') }
      `,
      '',
    ),
  )
  Tests.expect((await workspace.files.openFile(entry)).status).toBe('published')
  const repaired = workspace.lastGoodRevision
  const publishedCount = published.length
  Tests.expect(publishedCount).toBeGreaterThan(1)
  const moduleConfig = Path.join(ui, '@ui/tsconfig.json')
  await Files.withWritableFile(moduleConfig, file => file.write('{ drifted }' + NewlineCharacter))
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
  workspace: WorkspaceSession,
  entry: string,
  ui: string,
  published: string[],
): Promise<void> {
  const path = Path.join(ui, '@ui/Widget.tao')
  const source = await FS.readFile(path, 'utf8')
  const lastGood = workspace.lastGoodRevision
  const publishedCount = published.length
  await FS.writeFile(path, `${source}${NewlineCharacter}requires npm:react version 1.0.0${NewlineCharacter}`)
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
  await FS.writeFile(path, source)
}

function ArtifactsRoot(): string {
  return Repo.resolvePath('.artifacts/tmp', `managed-dependencies-${Platform.randomUUID()}`)
}
