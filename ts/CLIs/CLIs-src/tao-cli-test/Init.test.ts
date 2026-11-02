import { Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { initializeProject } from '@workspace/projects/Projects'

Tests.test('tao init --library scaffolds a consumer without changing existing files', async () => {
  const root = temporaryDirectory('init-library')
  const consumerRoot = Path.join(root, 'Starter App')
  const userFile = Path.join(consumerRoot, 'notes.txt')
  await FileSystem.mkdir(consumerRoot)
  await FileSystem.writeFile(userFile, 'keep this')
  await Try(async () => {
    const result = await initializeLibraryConsumer(consumerRoot, root)

    Tests.expect(result.status).toBe(0)
    Tests.expect(result.stdout).toContain(`Initialized Tao library project: ${consumerRoot}`)
    Tests.expect(await FileSystem.readFile(userFile, 'utf8')).toBe('keep this')
    Tests.expect(await FileSystem.readFile(Path.join(consumerRoot, 'src/tao/Library.tao'), 'utf8'))
      .toContain('ts-library Demo')
    const packageManifest = await FileSystem.readFile(Path.join(consumerRoot, 'src/ts/package.json'), 'utf8')
    Tests.expect(packageManifest).toContain('"entry": "../tao/Library.tao"')
    Tests.expect(packageManifest).toContain('"entry": "Consumer.tsx"')
    Tests.expect(await FileSystem.exists(Path.join(consumerRoot, '.tao/store/project.json'))).toBe(true)
    Tests.expect(await FileSystem.exists(Path.join(consumerRoot, '.tao/.gitignore'))).toBe(true)
    const recipes = await FileSystem.readFile(Path.join(consumerRoot, 'Justfile'), 'utf8')
    Tests.expect(recipes).not.toContain('default:')
    Tests.expect(recipes).toContain('help:')
    Tests.expect(recipes).toContain('"{{TAO}}" compile Demo --package src/ts')
    Tests.expect(recipes).toContain('"{{TAO}}" run --package src/ts --web')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('tao init --library preflights every generated file before project initialization', async () => {
  const root = temporaryDirectory('init-library-collision')
  const consumerRoot = Path.join(root, 'Starter App')
  const collision = Path.join(consumerRoot, 'src/ts/package.json')
  await FileSystem.mkdirs(Path.dirname(collision))
  await FileSystem.writeFile(collision, '{"userOwned":true}\n')
  await Try(async () => {
    const result = await initializeLibraryConsumer(consumerRoot, root)

    Tests.expect(result.status).toBe(1)
    Tests.expect(result.stdout + result.stderr).toContain(collision)
    Tests.expect(await FileSystem.readFile(collision, 'utf8')).toBe('{"userOwned":true}\n')
    Tests.expect(await FileSystem.exists(Path.join(consumerRoot, '.tao'))).toBe(false)
    Tests.expect(await FileSystem.exists(Path.join(consumerRoot, 'src/tao/Library.tao'))).toBe(false)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('tao init --library rejects a nested project without creating a child project', async () => {
  const root = temporaryDirectory('init-library-nested')
  const parent = Path.join(root, 'Parent')
  const child = Path.join(parent, 'Child')
  await FileSystem.mkdir(parent)
  await initializeProject(parent)
  await FileSystem.mkdir(child)
  await Try(async () => {
    const initialized = await initializeLibraryConsumer(child, root)

    Tests.expect(initialized.status).toBe(1)
    Tests.expect(initialized.stdout + initialized.stderr).toContain('Cannot initialize a nested Tao project')
    Tests.expect(await FileSystem.exists(Path.join(child, '.tao'))).toBe(false)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('tao init --library requires an existing target directory', async () => {
  const root = temporaryDirectory('init-library-missing')
  const target = Path.join(root, 'New Project')
  await FileSystem.mkdir(root)
  await Try(async () => {
    const result = await initializeLibraryConsumer(target, root)

    Tests.expect(result.status).toBe(1)
    Tests.expect(result.stdout + result.stderr).toContain('must be an existing directory')
    Tests.expect(await FileSystem.exists(target)).toBe(false)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

type CommandResult = { status: number; stdout: string; stderr: string }

async function initializeLibraryConsumer(target: string, storageRoot: string): Promise<CommandResult> {
  const environment = {
    ...Env.snapshot(),
    TAO_CACHE_DIR: Path.join(storageRoot, '.cache-fixture'),
    TAO_CLI_CWD: undefined,
    TAO_SUPPORT_DIR: Path.join(storageRoot, '.support-fixture'),
  }
  const child = Platform.spawnPiped(Repo.resolvePath('tao'), {
    variadicArgs: ['init', target, '--library'],
    cwd: Repo.getWorkspaceRoot(),
    env: environment,
    stdin: 'ignore',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  return { status, stdout, stderr }
}

function temporaryDirectory(name: string): string {
  return Artifacts.resolvePath('tmp', `${name}-${Platform.randomUUID()}`)
}
