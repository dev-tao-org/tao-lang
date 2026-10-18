import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { createProject, createWorkspace } from '../workspace-src/Workspace'

Tests.test('project compilation creates its runtime lazily and publishes only changed build files', async () => {
  const root = Artifacts.resolvePath('tmp', `project-compile-${Platform.randomUUID()}`)
  await Try(() => verifyProjectCompilation(root), {
    finally() {
      return FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

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
    compile() {
      return code
    },
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
  const runtimeAsset = Path.join(runtime.directory, 'src/_gen_runtime/TR.js')
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
  const files = {
    'runtime.json': JSON.stringify({ version: 1, identity: 'fixture', dependencies: { expo: '57.0.30' } }),
    'package.json': JSON.stringify({ dependencies: { expo: '57.0.30' } }),
    'bun.lock': 'fixture lock',
    'TR.js': 'compiled runtime',
    'HMRClient.js': 'compiled HMR adapter',
  }
  for (const [file, content] of Object.entries(files)) {
    await FileSystem.writeFile(Path.join(directory, file), content)
  }
}
