import { Errors, Try } from '@shared'
import { Env } from '@shared/os'
import { Files, FileSystem, Http, Path, Platform, Repo, Tests } from '@shared/os'
import type { ProjectPipelineServices } from '../workspace-src/ProjectPipeline'
import { inspectProjectPreparation, managedModulesInput, prepareProject } from '../workspace-src/ProjectPreparation'
import { cleanProject } from '../workspace-src/projects/Clean'
import { initializeProject } from '../workspace-src/projects/Projects'
import { openProjectWorkspace } from '../workspace-src/ProjectWorkspace'
import { prepareSidecarPipeline } from '../workspace-src/SidecarPipeline'
import type { BunExecutor } from '../workspace-src/sidecars/ManagedModules'
import { generatedModuleFiles, readManagedModules } from '../workspace-src/sidecars/ManagedModules'
import { openAutomaticWorkspace } from './managed-fixtures/AutomaticWorkflow'

const runtimePins = { react: '0.0.0-tao-fixture' }

Tests.test('managed npm preparation resolves a local project foreign view through an isolated registry', async () => {
  const root = ArtifactsRoot()
  const requests: string[] = []
  const workspaceHandles: Awaited<ReturnType<typeof openProjectWorkspace>>[] = []
  await FileSystem.mkdir(root, { recursive: true })
  await Try(async () => {
    const { app, ui, entry } = await createFixtureProjects(root)
    const artifacts = await packageArtifacts(root)
    const server = startLocalRegistry(artifacts, requests)
    await Try(async () => {
      const registry = `http://127.0.0.1:${server.port}`
      await expectInstallRetry(entry, root)
      const published: string[] = []
      const workspace = await openAutomaticWorkspace(
        entry,
        published,
        bunExecutor(root, registry),
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

async function createFixtureProjects(root: string): Promise<{ app: string; ui: string; entry: string }> {
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

async function packageArtifacts(root: string): Promise<Map<string, PackageArtifact>> {
  const fixtures = Repo.resolvePath('ts/0-workspace/workspace-test/managed-fixtures/packages')
  const packages = new Map<string, PackageArtifact>()
  for (const name of ['react', 'tao-fixture-label', 'string-width']) {
    const directory = Path.join(root, 'registry', name, 'package')
    await FileSystem.mkdir(Path.dirname(directory), { recursive: true })
    await FileSystem.cp(Path.join(fixtures, name), directory, { recursive: true })
    await FileSystem.rename(Path.join(directory, 'index-js.fixture'), Path.join(directory, 'index.js'))
    const manifest = JSON.parse(await FileSystem.readFile(Path.join(directory, 'package.json'), 'utf8'))
    const archive = Path.join(root, 'registry', `${name}.tgz`)
    await Platform.capture('tar', { variadicArgs: ['-czf', archive, 'package'], cwd: Path.dirname(directory) })
    const bytes = await FileSystem.readFile(archive)
    packages.set(name, {
      bytes,
      integrity: Platform.hashBytes(bytes, 'sha512'),
      ...(manifest.dependencies ? { dependencies: manifest.dependencies } : {}),
    })
  }
  return packages
}

function startLocalRegistry(packages: Map<string, PackageArtifact>, requests: string[]) {
  return Http.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const path = Http.url(request.url).pathname
      requests.push(request.url)
      const tarball = /^\/tarballs\/([a-z0-9-]+)\.tgz$/.exec(path)
      if (tarball) {
        const artifact = packages.get(tarball[1]!)
        return artifact
          ? Http.bytesResponse(artifact.bytes)
          : Http.response('missing tarball', { status: 404 })
      }
      const name = path.slice(1)
      const artifact = packages.get(name)
      return artifact
        ? Http.jsonResponse(metadata(name, artifact, request.url))
        : Http.response('not found', { status: 404 })
    },
  })
}

function metadata(name: string, artifact: PackageArtifact, requestUrl: string): unknown {
  const version = name === 'react' ? runtimePins.react : name === 'string-width' ? '4.1.0' : '1.0.0'
  const origin = Http.url(requestUrl).origin
  return {
    name,
    versions: {
      [version]: {
        name,
        version,
        ...(artifact.dependencies ? { dependencies: artifact.dependencies } : {}),
        dist: { tarball: `${origin}/tarballs/${name}.tgz`, integrity: `sha512-${artifact.integrity}` },
      },
    },
    'dist-tags': { latest: version },
  }
}

async function expectInstallRetry(entry: string, root: string): Promise<void> {
  await Tests.rejects(
    prepareProject(entry, {
      runtimePins,
      executor: async (_command, args) =>
        args[0] === '--version'
          ? { status: 0, stdout: `${Platform.runtimeVersion()}\n`, stderr: '' }
          : { status: 1, stdout: '', stderr: 'fixture install interruption' },
    }),
    /could not be prepared.*fixture install interruption/,
  )
  Tests.expect(await FileSystem.readdir(Path.join(root, 'app/.tao/store/npm'))).toEqual([])
}

function bunExecutor(root: string, registry: string): BunExecutor {
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
  packages: Map<string, PackageArtifact>,
  registry: string,
): Promise<void> {
  const entry = FileSystem.resolveModule('tao-fixture-label', Path.join(ui, '@ui'))
  const react = FileSystem.resolveModule('react', Path.join(ui, '@ui'))
  Tests.expect(await FileSystem.readFile(entry, 'utf8')).toContain('label:')
  Tests.expect(await FileSystem.readFile(react.replace(/index\.js$/, 'package.json'), 'utf8'))
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
    managedInput: async (root, program) => managedModulesInput(root, program.modules, runtimePins),
    readManaged: readManagedModules,
    generatedFiles: generatedModuleFiles,
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
  const result = initial.status === 'published' ? 'published' : 'error' in initial ? initial.error : initial.status
  Tests.expect(result).toBe('published')
  Tests.expect(published).toHaveLength(2)
  Tests.expect(published[0]).toContain('foreign-views')
  Tests.expect(FileSystem.resolveModule('react', Path.join(ui, '@ui'))).toContain('node_modules/react')
  const importPath = /import\s+\{\s*Widget as _taoForeignView\d+\s*\}\s+from\s+("(?:[^"\\]|\\.)*")/.exec(published[0]!)
  Tests.expect(importPath).not.toBeNull()
  const modulePath = JSON.parse(importPath![1]!) as string
  const module = Platform.loadModule<{ Widget(props: { Value: string }): unknown }>(modulePath)
  Tests.expect(module.Widget({ Value: 'acceptance' })).toBe('label:acceptance')
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
    return bunExecutor(root, registry)(command, args, cwd)
  }
  await prepareProject(entry, { executor, runtimePins, repair: true })
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
  await Tests.rejects(inspectProjectPreparation(entry, { runtimePins }), /drifted|Generated dependency files changed/)
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
    prepareProject(entry, {
      runtimePins,
      executor: async () => Errors.ThrowShouldNeverHappen('A runtime conflict must fail before invoking Bun.'),
    }),
    /incompatible versions of react/,
  )
  Tests.expect((await workspace.files.openFile(entry)).status).toBe('failed')
  Tests.expect(workspace.lastGoodRevision).toBe(lastGood)
  Tests.expect(published).toHaveLength(publishedCount)
  await FileSystem.writeFile(path, source)
}

type PackageArtifact = { bytes: Http.Bytes; integrity: string; dependencies?: Record<string, string> }

function ArtifactsRoot(): string {
  return Repo.resolvePath('.artifacts/tmp', `managed-dependencies-${Platform.randomUUID()}`)
}
