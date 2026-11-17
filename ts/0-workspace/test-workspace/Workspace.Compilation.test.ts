import * as RuntimeTooling from '@cli-kit/runtime-tooling'
import type * as Runtime from '@runtime'
import { Json } from '@shared'
import { Timings, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import { createProject, createWorkspace, type WorkspaceSession } from '../workspace-src/Workspace'

Tests.test('project compilation creates its runtime lazily and publishes only changed build files', async () => {
  const root = Artifacts.resolvePath('tmp', `project-compile-${Platform.randomUUID()}`)
  await Try(() => verifyProjectCompilation(root), {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('opening an authored folder keeps generated runtime output outside the workspace', async () => {
  const root = Artifacts.resolvePath('tmp', `folder-workspace-${Platform.randomUUID()}`)
  await Try(() => verifyFolderWorkspace(root), {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
})

async function verifyFolderWorkspace(root: string): Promise<void> {
  const directory = Path.join(root, 'authored')
  const outputDirectory = Path.join(root, 'output')
  const resourcesDirectory = Path.join(root, 'resources')
  await FS.mkdir(directory)
  await FS.writeFile(
    Path.join(directory, 'Hello World.tao'),
    await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao'),
  )
  await writeResources(resourcesDirectory)
  const workspace = createWorkspace({
    directory,
    outputDirectory,
    runtimeOptions: {
      resourcesDirectory,
      toolchainCacheDirectory: Path.join(root, 'toolchains'),
      install: {
        async install(target) {
          await FS.mkdir(Path.join(target, 'node_modules'))
        },
      },
    },
  })
  await Try(async () => {
    Tests.expect((await workspace.openFile('Hello World.tao')).status).toBe('published')
    Tests.expect(await FS.readdir(directory)).toEqual(['Hello World.tao'])
    Tests.expect(workspace.runtime?.directory).toBe(Path.join(outputDirectory, 'expo'))
    Tests.expect(await FS.exists(Path.join(workspace.runtime!.directory, 'Application.ts'))).toBe(true)
    Tests.expect(await FS.exists(Path.join(workspace.runtime!.directory, 'index.ts'))).toBe(false)
    Tests.expect(await FS.readFile(Path.join(workspace.runtime!.directory, 'package.json'), 'utf8'))
      .toContain('"main": "Application.ts"')
    Tests.expect(await FS.readFile(workspace.runtime!.appPath, 'utf8')).toBe(
      await FS.readFile(Path.join(outputDirectory, 'build/App.tsx'), 'utf8'),
    )
  }, {
    async finally() {
      await workspace.dispose()
    },
  })
}

async function verifyProjectCompilation(root: string): Promise<void> {
  const project = await createProject({ directory: Path.join(root, 'project') })
  Tests.expect(await FS.readdir(project.directory)).toEqual(['.tao'])
  const resourcesDirectory = Path.join(root, 'resources')
  await writeResources(resourcesDirectory)
  let installs = 0
  let files = { 'App.tsx': 'compiled A', 'source/Widget.ts': 'export const value = 1' }
  let snapshot = 'A'
  const workspace = createWorkspace({
    project,
    runtimeOptions: {
      resourcesDirectory,
      toolchainCacheDirectory: Path.join(root, 'toolchains'),
      install: {
        async install(directory) {
          installs++
          await FS.mkdir(Path.join(directory, 'node_modules'))
        },
      },
    },
    compile: Timings.createTopLevelTimer(() => files),
    beforeCompile: async () => ({ snapshotDirectories: [Path.join(root, snapshot)] }),
  })
  await Try(async () => {
    Tests.expect((await workspace.update('app')).status).toBe('invalid')
    Tests.expect(installs).toBe(0)
    const source = await Tests.readFixture('ts/repo-analysis/performance-fixtures/Performance/Performance.tao')
    Tests.expect((await workspace.update(source)).status).toBe('published')
    await verifyPublication(workspace, project.buildDirectory, source, () =>
      files = {
        'App.tsx': 'compiled B',
        'source/Widget.ts': 'export const value = 2',
      })
    await verifyLiveSnapshotBoundary(workspace, source, value => snapshot = value)
    Tests.expect(installs).toBe(1)
  }, {
    async finally() {
      await workspace.dispose()
    },
  })
}

async function verifyLiveSnapshotBoundary(
  workspace: WorkspaceSession,
  source: string,
  changeSnapshot: (value: string) => void,
): Promise<void> {
  let publications = 0
  workspace.runtime!.publishGenerated = async revision => {
    publications++
    return {
      sessionId: 'fixture',
      revision: revision.revision,
      sequence: revision.sequence,
      status: 'published',
      publishedRevision: revision.revision,
    }
  }
  changeSnapshot('B')
  const changed = await workspace.update(source)
  Tests.expect(changed.status).toBe('failed')
  Tests.expect(changed.status === 'failed' && changed.error).toContain('Restart the preview session')
  Tests.expect(publications).toBe(0)
  changeSnapshot('A')
  const recovered = await workspace.update(source)
  Tests.expect(recovered.status).toBe('published')
  Tests.expect(publications).toBe(1)
}

async function verifyPublication(
  workspace: WorkspaceSession,
  buildDirectory: string,
  source: string,
  changeCode: () => void,
): Promise<void> {
  const runtime = workspace.runtime!
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe('compiled A')
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'source/Widget.ts'), 'utf8')).toBe('export const value = 1')
  await verifyGeneratedBuildConfiguration(buildDirectory, runtime)
  const unchanged = await verifyUnchangedGeneratedFiles(workspace, source, runtime)
  const runtimeAsset = Path.join(runtime.directory, 'src/_gen_runtime/runtime/TR.ts')
  const assetInode = FS.statSync(runtimeAsset).ino
  changeCode()
  Tests.expect((await workspace.update(source)).status).toBe('published')
  Tests.expect(await FS.readFile(runtime.appPath, 'utf8')).toBe('compiled B')
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe('compiled B')
  Tests.expect(await FS.readFile(Path.join(buildDirectory, 'source/Widget.ts'), 'utf8')).toBe('export const value = 2')
  Tests.expect(FS.statSync(runtime.appPath).ino).not.toBe(unchanged.appInode)
  Tests.expect(FS.statSync(Path.join(runtime.directory, 'src/source/Widget.ts')).ino)
    .not.toBe(unchanged.sourceInode)
  Tests.expect(FS.statSync(runtimeAsset).ino).toBe(assetInode)
}

async function verifyGeneratedBuildConfiguration(
  buildDirectory: string,
  runtime: Runtime.RuntimeApplication,
): Promise<void> {
  const configPath = Path.join(buildDirectory, 'tsconfig.json')
  const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile)
  Tests.expect(config.error).toBeUndefined()
  Tests.expect(config.config.extends).toBeUndefined()
  Tests.expect(config.config.compilerOptions.module).toBe('ESNext')
  const parsed = TypeScript.parseJsonConfigFileContent(config.config, TypeScript.sys, buildDirectory)
  Tests.expect(parsed.fileNames).toContain(Path.join(buildDirectory, 'source/Widget.ts'))
  Tests.expect(parsed.errors).toEqual([])
  Tests.expect(FS.realpathSync(Path.join(buildDirectory, 'node_modules'))).toBe(
    FS.realpathSync(Path.join(runtime.directory, 'node_modules')),
  )
  const physicalBuildDirectory = FS.realpathSync(buildDirectory)
  const physicalConfig = TypeScript.readConfigFile(
    Path.join(physicalBuildDirectory, 'tsconfig.json'),
    TypeScript.sys.readFile,
  )
  Tests.expect(physicalConfig.error).toBeUndefined()
  const physicalParsed = TypeScript.parseJsonConfigFileContent(
    physicalConfig.config,
    TypeScript.sys,
    physicalBuildDirectory,
  )
  Tests.expect(physicalParsed.fileNames).toContain(Path.join(physicalBuildDirectory, 'source/Widget.ts'))
  Tests.expect(physicalParsed.errors).toEqual([])
  Tests.expect(FS.realpathSync(Path.join(physicalBuildDirectory, 'node_modules'))).toBe(
    FS.realpathSync(Path.join(runtime.directory, 'node_modules')),
  )
}

async function verifyUnchangedGeneratedFiles(
  workspace: WorkspaceSession,
  source: string,
  runtime: Runtime.RuntimeApplication,
): Promise<{ appInode: number; sourceInode: number }> {
  Tests.expect(await FS.readFile(runtime.appPath, 'utf8')).toBe('compiled A')
  const original = FS.statSync(runtime.appPath).ino
  const sourcePath = Path.join(runtime.directory, 'src/source/Widget.ts')
  const originalSource = FS.statSync(sourcePath).ino
  await workspace.update(source)
  Tests.expect(FS.statSync(runtime.appPath).ino).toBe(original)
  Tests.expect(FS.statSync(sourcePath).ino).toBe(originalSource)
  return { appInode: original, sourceInode: originalSource }
}

async function writeResources(directory: string): Promise<void> {
  await FS.mkdir(directory)
  const runtimeSources = await RuntimeTooling.readRuntimeSources()
  const sourceFiles = Object.keys(runtimeSources)
  await FS.writeFile(
    Path.join(directory, 'runtime.json'),
    Json.Print({
      version: 2,
      identity: 'fixture',
      dependencies: { expo: '57.0.30' },
      sourceFiles,
    }),
  )
  await FS.writeFile(
    Path.join(directory, 'package.json'),
    Json.Print({ dependencies: { expo: '57.0.30' } }),
  )
  await FS.writeFile(Path.join(directory, 'bun.lock'), 'fixture lock')
  for (const [resource, sourcePath] of Object.entries(runtimeSources)) {
    const content = await FS.readFile(Repo.resolvePath(sourcePath), 'utf8')
    const target = Path.join(directory, resource)
    await FS.mkdir(Path.dirname(target))
    await FS.writeFile(target, content)
  }
}
