import { RuntimeSourceResources } from '@runtime/RuntimeResources'
import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { createProject, createWorkspace } from '../workspace-src/Workspace'

Tests.test('project compilation creates its runtime lazily and publishes only changed build files', async () => {
  const root = Artifacts.resolvePath('tmp', `project-compile-${Platform.randomUUID()}`)
  await Try(() => verifyProjectCompilation(root), {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})

Tests.test('opening an authored folder keeps generated runtime output outside the workspace', async () => {
  const root = Artifacts.resolvePath('tmp', `folder-workspace-${Platform.randomUUID()}`)
  await Try(() => verifyFolderWorkspace(root), {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})

async function verifyFolderWorkspace(root: string): Promise<void> {
  const directory = Path.join(root, 'authored')
  const outputDirectory = Path.join(root, 'output')
  const resourcesDirectory = Path.join(root, 'resources')
  await FileSystem.mkdir(directory, { recursive: true })
  await FileSystem.writeFile(Path.join(directory, 'Hello World.tao'), await Tests.readApp('Hello World'))
  await writeResources(resourcesDirectory)
  const workspace = createWorkspace({
    directory,
    outputDirectory,
    runtimeOptions: {
      resourcesDirectory,
      toolchainCacheDirectory: Path.join(root, 'toolchains'),
      install: {
        async install(target) {
          await FileSystem.mkdir(Path.join(target, 'node_modules'), { recursive: true })
        },
      },
    },
  })
  await Try(async () => {
    Tests.expect((await workspace.openFile('Hello World.tao')).status).toBe('published')
    Tests.expect(await FileSystem.readdir(directory)).toEqual(['Hello World.tao'])
    Tests.expect(workspace.runtime?.directory).toBe(Path.join(outputDirectory, 'runtime'))
    Tests.expect(await FileSystem.readFile(workspace.runtime!.appPath, 'utf8')).toBe(
      await FileSystem.readFile(Path.join(outputDirectory, 'build/App.tsx'), 'utf8'),
    )
  }, {
    finally() {
      workspace.dispose()
    },
  })
}

async function verifyProjectCompilation(root: string): Promise<void> {
  const project = await createProject({ directory: Path.join(root, 'project') })
  Tests.expect(await FileSystem.readdir(project.directory)).toEqual(['.tao'])
  const resourcesDirectory = Path.join(root, 'resources')
  await writeResources(resourcesDirectory)
  let installs = 0
  let code = 'compiled A'
  const workspace = createWorkspace({
    project,
    runtimeOptions: {
      resourcesDirectory,
      toolchainCacheDirectory: Path.join(root, 'toolchains'),
      install: {
        async install(directory) {
          installs++
          await FileSystem.mkdir(Path.join(directory, 'node_modules'), { recursive: true })
        },
      },
    },
    compile: () => code,
  })
  await Try(async () => {
    Tests.expect((await workspace.update('app')).status).toBe('invalid')
    Tests.expect(installs).toBe(0)
    const source = await Tests.readApp('Hello World')
    Tests.expect((await workspace.update(source)).status).toBe('published')
    await verifyPublication(workspace, project.buildDirectory, source, () => code = 'compiled B')
    Tests.expect(installs).toBe(1)
  }, {
    finally() {
      workspace.dispose()
    },
  })
}

async function verifyPublication(
  workspace: ReturnType<typeof createWorkspace>,
  buildDirectory: string,
  source: string,
  changeCode: () => void,
): Promise<void> {
  const runtime = workspace.runtime!
  Tests.expect(await FileSystem.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe('compiled A')
  Tests.expect(await FileSystem.readFile(runtime.appPath, 'utf8')).toBe('compiled A')
  const original = FileSystem.statSync(runtime.appPath).ino
  await workspace.update(source)
  Tests.expect(FileSystem.statSync(runtime.appPath).ino).toBe(original)
  const runtimeAsset = Path.join(runtime.directory, 'src/_gen_runtime/runtime/TR.ts')
  const assetInode = FileSystem.statSync(runtimeAsset).ino
  changeCode()
  Tests.expect((await workspace.update(source)).status).toBe('published')
  Tests.expect(await FileSystem.readFile(runtime.appPath, 'utf8')).toBe('compiled B')
  Tests.expect(await FileSystem.readFile(Path.join(buildDirectory, 'App.tsx'), 'utf8')).toBe('compiled B')
  Tests.expect(FileSystem.statSync(runtime.appPath).ino).not.toBe(original)
  Tests.expect(FileSystem.statSync(runtimeAsset).ino).toBe(assetInode)
}

async function writeResources(directory: string): Promise<void> {
  await FileSystem.mkdir(directory, { recursive: true })
  const sourceFiles = Object.keys(RuntimeSourceResources)
  await FileSystem.writeFile(
    Path.join(directory, 'runtime.json'),
    JSON.stringify({
      version: 2,
      identity: 'fixture',
      dependencies: { expo: '57.0.30' },
      sourceFiles,
    }),
  )
  await FileSystem.writeFile(
    Path.join(directory, 'package.json'),
    JSON.stringify({ dependencies: { expo: '57.0.30' } }),
  )
  await FileSystem.writeFile(Path.join(directory, 'bun.lock'), 'fixture lock')
  for (const [resource, sourcePath] of Object.entries(RuntimeSourceResources)) {
    const content = await FileSystem.readFile(Repo.resolvePath(sourcePath), 'utf8')
    const target = Path.join(directory, resource)
    await FileSystem.mkdir(Path.dirname(target), { recursive: true })
    await FileSystem.writeFile(target, content)
  }
}
