import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform } from '@shared/os'
import type { ContractExecutor } from '../sidecars/ForeignViewContracts'

/** Fixture owns the isolated source module and prepared sidecar contract paths. */
export type Fixture = {
  projectDirectory: string
  sessionBuildDirectory: string
  nodeModulesDirectory: string
  dependencyFingerprint: string
  target: string
  program: ReturnType<typeof programFor>
  directory: string
  moduleRoot: string
  taoPath: string
}

/** withFixture runs a sidecar assertion and removes only its isolated fixture afterward. */
export async function withFixture(action: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await createFixture()
  await Try(action.bind(undefined, fixture), {
    finally: () => FileSystem.rm(fixture.directory, { recursive: true, force: true }),
  })
}

/** recordingExecutor records a contract invocation without launching external tooling. */
export function recordingExecutor(onCall: () => void): ContractExecutor {
  return async () => {
    onCall()
    return { status: 0, stdout: '', stderr: '' }
  }
}

/** executeTypeScript launches the fixture's selected contract tool in its owned directory. */
export async function executeTypeScript(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<{ status: number; stdout: string; stderr: string }> {
  const child = Platform.spawn([command, ...args], {
    cwd,
    env: Env.snapshot(),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  return { status, stdout, stderr }
}

/** programFor links one parsed source module for a sidecar contract fixture. */
export function programFor(path: string, document: NonNullable<ReturnType<typeof transform>>) {
  return {
    entry: path,
    modules: [{ path, document, bindings: [] }],
    definitions: [],
  }
}

async function createFixture(): Promise<Fixture> {
  const directory = Artifacts.resolvePath('tmp', `sidecar-pipeline-${Platform.randomUUID()}`)
  const projectDirectory = Path.join(directory, 'project')
  const moduleRoot = Path.join(projectDirectory, '@calendar')
  const taoPath = Path.join(moduleRoot, 'Calendar.tao')
  const nodeModulesDirectory = Path.join(directory, 'managed', 'node_modules')
  await FileSystem.mkdir(Path.join(projectDirectory, '.tao', 'cache', 'sidecars'), { recursive: true })
  await FileSystem.writeFile(
    Path.join(projectDirectory, '.tao', 'cache', 'sidecars', 'typescript-defaults.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, jsx: 'react-jsx' } }),
  )
  await FileSystem.mkdir(moduleRoot, { recursive: true })
  await FileSystem.mkdir(nodeModulesDirectory, { recursive: true })
  await FileSystem.mkdir(Path.join(nodeModulesDirectory, '@types', 'react'), { recursive: true })
  await FileSystem.writeFile(
    Path.join(nodeModulesDirectory, '@types', 'react', 'index.d.ts'),
    'export type ComponentType<Props> = (props: Props) => unknown\n',
  )
  await FileSystem.writeFile(taoPath, 'fixture source path')
  await FileSystem.writeFile(
    Path.join(moduleRoot, 'FormattedDate.tsx'),
    [
      "import { formatDate } from './format'",
      "import logo from './logo.png'",
      'export function FormattedDate(props: { Value: string }) { return null }',
      'void formatDate; void logo',
    ].join('\n'),
  )
  await FileSystem.writeFile(Path.join(moduleRoot, 'format.ts'), 'export const formatDate = () => "old"\n')
  await FileSystem.writeFile(Path.join(moduleRoot, 'logo.png'), 'asset-bytes')
  const document = transform(
    createParser().parse(
      'app Calendar { root FormattedDate } public view FormattedDate(Value text) from ./FormattedDate.tsx',
    ),
  )!
  return {
    projectDirectory,
    sessionBuildDirectory: Path.join(projectDirectory, '.tao', 'cache', 'build'),
    nodeModulesDirectory,
    dependencyFingerprint: 'managed-graph-v1',
    target: 'web',
    program: programFor(taoPath, document),
    directory,
    moduleRoot,
    taoPath,
  }
}
