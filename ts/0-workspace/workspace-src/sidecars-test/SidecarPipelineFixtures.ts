import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { NewlineCharacter, S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform } from '@shared/os'
import type { LinkedModule, LinkedProgram } from '@typecheck/Modules'
import type { ContractExecutor } from '../sidecars/ForeignViewContracts'
import type { SidecarCommandResult } from '../sidecars/managed-modules/ManagedModuleTypes'

/** Fixture owns the isolated source module and prepared sidecar contract paths. */
export type Fixture = {
  projectDirectory: string
  sessionBuildDirectory: string
  nodeModulesDirectory: string
  dependencyFingerprint: string
  target: string
  program: SidecarFixtureProgram
  directory: string
  moduleRoot: string
  taoPath: string
}

/** SidecarFixtureProgram keeps its fixture-owned module list editable between contract scenarios. */
export type SidecarFixtureProgram = Omit<LinkedProgram, 'modules'> & { modules: LinkedModule[] }

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
): Promise<SidecarCommandResult> {
  const child = Platform.spawnPiped([command, ...args], { cwd })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  return { status, stdout, stderr }
}

/** createProgramFor links one parsed source module for a sidecar contract fixture. */
export function createProgramFor(path: string, document: AST.Document): SidecarFixtureProgram {
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
  await FileSystem.mkdir(Path.join(projectDirectory, '.tao', 'cache', 'sidecars'))
  await FileSystem.writeFile(
    Path.join(projectDirectory, '.tao', 'cache', 'sidecars', 'typescript-defaults.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, jsx: 'react-jsx' } }),
  )
  await FileSystem.mkdirs(moduleRoot, nodeModulesDirectory, Path.join(nodeModulesDirectory, '@types', 'react'))
  await FileSystem.writeFile(
    Path.join(nodeModulesDirectory, '@types', 'react', 'index.d.ts'),
    'export type ComponentType<Props> = (props: Props) => unknown' + NewlineCharacter,
  )
  await FileSystem.writeFile(taoPath, 'fixture source path')
  await FileSystem.writeFile(
    Path.join(moduleRoot, 'FormattedDate.tsx'),
    S`
      import { formatDate } from './format'
      import logo from './logo.png'
      export function FormattedDate(props: { Value: string }) { return null }
      void formatDate; void logo
    `,
  )
  const formatSource = 'export const formatDate = () => "old"' + NewlineCharacter
  await FileSystem.writeFile(Path.join(moduleRoot, 'format.ts'), formatSource)
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
    program: createProgramFor(taoPath, document),
    directory,
    moduleRoot,
    taoPath,
  }
}
