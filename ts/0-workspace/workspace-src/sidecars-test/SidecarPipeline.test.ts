import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Try } from '@shared'
import { Artifacts, Env, FileSystem, Path, Platform, Tests } from '@shared/os'
import { prepareSidecarPipeline } from '../SidecarPipeline'
import type { ContractExecutor } from '../sidecars/ForeignViewContracts'

Tests.test('sidecar snapshots include helpers and assets, reuse unchanged checks, and preserve prior revisions', async () =>
  await withFixture(async fixture => {
    let checks = 0
    const executor = recordingExecutor(() => checks++)
    const first = await prepareSidecarPipeline({ ...fixture, executor })
    const originalSnapshot = first.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    Tests.expect(await FileSystem.readFile(originalSnapshot, 'utf8')).toContain("from './format'")
    Tests.expect(await FileSystem.readFile(Path.join(Path.dirname(originalSnapshot), 'format.ts'), 'utf8'))
      .toContain('formatDate')
    Tests.expect(await FileSystem.readFile(Path.join(Path.dirname(originalSnapshot), 'logo.png'), 'utf8'))
      .toBe('asset-bytes')
    Tests.expect(FileSystem.realpathSync(Path.join(Path.dirname(originalSnapshot), 'node_modules')))
      .toBe(FileSystem.realpathSync(fixture.nodeModulesDirectory))
    Tests.expect(checks).toBe(1)

    const cached = await prepareSidecarPipeline({ ...fixture, executor })
    Tests.expect(cached.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')).toBe(originalSnapshot)
    Tests.expect(checks).toBe(1)

    await FileSystem.writeFile(Path.join(fixture.moduleRoot, 'format.ts'), 'export const formatDate = () => "new"\n')
    const changed = await prepareSidecarPipeline({ ...fixture, executor })
    const nextSnapshot = changed.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    Tests.expect(nextSnapshot).not.toBe(originalSnapshot)
    Tests.expect(await FileSystem.readFile(originalSnapshot, 'utf8')).toContain("from './format'")
    Tests.expect(await FileSystem.readFile(Path.join(Path.dirname(nextSnapshot), 'format.ts'), 'utf8'))
      .toContain('"new"')
    Tests.expect(checks).toBe(2)
  }))

Tests.test('rebuilds a corrupted snapshot without replacing the previously published tree', async () =>
  await withFixture(async fixture => {
    const executor = recordingExecutor(() => {})
    const first = await prepareSidecarPipeline({ ...fixture, executor })
    const original = first.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    const root = Path.dirname(Path.dirname(Path.dirname(original)))
    await FileSystem.writeFile(Path.join(root, '.tao-sidecar-snapshot.json'), '{broken')

    const repaired = await prepareSidecarPipeline({ ...fixture, executor })
    const replacement = repaired.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    Tests.expect(replacement).not.toBe(original)
    Tests.expect(await FileSystem.readFile(original, 'utf8')).toContain("from './format'")
    Tests.expect(await FileSystem.readFile(replacement, 'utf8')).toContain("from './format'")
    const cached = await prepareSidecarPipeline({ ...fixture, executor })
    Tests.expect(cached.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')).toBe(replacement)
  }))

Tests.test('collects foreign views through a symlinked project root', async () =>
  await withFixture(async fixture => {
    const alias = Path.join(fixture.directory, 'project-alias')
    await FileSystem.symlink(fixture.projectDirectory, alias, 'dir')
    const aliasEntry = Path.join(alias, '@calendar', 'Calendar.tao')
    const prepared = await prepareSidecarPipeline({
      ...fixture,
      projectDirectory: alias,
      program: programFor(aliasEntry, fixture.program.modules[0]!.document),
      executor: recordingExecutor(() => {}),
    })
    const snapshot = prepared.resolveForeignViewPath(aliasEntry, './FormattedDate.tsx')
    Tests.expect(await FileSystem.readFile(snapshot, 'utf8')).toContain('FormattedDate')
    Tests.expect(prepared.snapshotDirectories.some(path => path.includes('foreign-views'))).toBe(true)
  }))

Tests.test('blocks a new snapshot when the active session reaches its snapshot budget', async () =>
  await withFixture(async fixture => {
    const options = { ...fixture, executor: recordingExecutor(() => {}), snapshotLimit: 1 }
    const first = await prepareSidecarPipeline(options)
    const snapshot = first.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    const cached = await prepareSidecarPipeline(options)
    Tests.expect(cached.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')).toBe(snapshot)
    await FileSystem.writeFile(Path.join(fixture.moduleRoot, 'format.ts'), 'export const formatDate = () => "next"\n')

    await Tests.rejects(prepareSidecarPipeline(options), /Restart preview to reclaim sidecar snapshots/)
    Tests.expect(await FileSystem.readFile(snapshot, 'utf8')).toContain("from './format'")
  }))

Tests.test('foreign sidecars reject symlink escapes before invoking the checker', async () =>
  await withFixture(async fixture => {
    const outside = Path.join(fixture.directory, 'outside.tsx')
    await FileSystem.writeFile(outside, 'export function FormattedDate() { return null }\n')
    await FileSystem.rm(Path.join(fixture.moduleRoot, 'FormattedDate.tsx'), { force: true })
    await FileSystem.symlink(outside, Path.join(fixture.moduleRoot, 'FormattedDate.tsx'), 'file')
    let checks = 0
    await Tests.rejects(
      prepareSidecarPipeline({
        ...fixture,
        executor: recordingExecutor(() => checks++),
      }),
      /escapes its module boundary/i,
    )
    Tests.expect(checks).toBe(0)
  }))

Tests.test('foreign sidecar imports cannot cross into another named module', async () =>
  await withFixture(async fixture => {
    const otherModule = Path.join(fixture.projectDirectory, '@other')
    await FileSystem.mkdir(otherModule, { recursive: true })
    await FileSystem.writeFile(Path.join(otherModule, 'helper.ts'), 'export const helper = true\n')
    await FileSystem.writeFile(
      Path.join(fixture.moduleRoot, 'FormattedDate.tsx'),
      [
        "import { helper } from '../@other/helper'",
        'export function FormattedDate(props: { Value: string }) { return null }',
        'void helper; void props',
      ].join('\n'),
    )
    let checks = 0
    await Tests.rejects(
      prepareSidecarPipeline({
        ...fixture,
        executor: recordingExecutor(() => checks++),
      }),
      /crosses its module boundary/i,
    )
    Tests.expect(checks).toBe(0)
  }))

Tests.test('file dependencies can validate sidecars inside their own project and relative helpers', async () =>
  await withFixture(async fixture => {
    const dependencyRoot = Path.join(fixture.directory, 'dependency')
    const moduleRoot = Path.join(dependencyRoot, '@widgets')
    const taoPath = Path.join(moduleRoot, 'Widgets.tao')
    await FileSystem.mkdir(Path.join(dependencyRoot, '.tao'), { recursive: true })
    await FileSystem.mkdir(moduleRoot, { recursive: true })
    await FileSystem.writeFile(taoPath, 'public view FormattedDate(Value text) from ./FormattedDate.tsx\n')
    await FileSystem.writeFile(
      Path.join(moduleRoot, 'FormattedDate.tao'),
      'public view FormattedDate(Value text) from ./FormattedDate.tsx\n',
    )
    await FileSystem.writeFile(
      Path.join(moduleRoot, 'FormattedDate.tsx'),
      [
        "import { formatDate } from './format'",
        'export function FormattedDate(props: { Value: string }) { return formatDate(props.Value) }',
      ].join('\n'),
    )
    await FileSystem.writeFile(
      Path.join(moduleRoot, 'format.ts'),
      'export const formatDate = (value: string) => value\n',
    )
    const dependencyDocument = transform(
      createParser().parse(
        'public view FormattedDate(Value text) from ./FormattedDate.tsx',
      ),
    )!
    fixture.program.modules.push({ path: taoPath, document: dependencyDocument, bindings: [] })
    const prepared = await prepareSidecarPipeline({ ...fixture, executor: executeTypeScript })
    const snapshotSidecar = prepared.resolveForeignViewPath(taoPath, './FormattedDate.tsx')
    Tests.expect(await FileSystem.readFile(snapshotSidecar, 'utf8')).toContain("from './format'")
    Tests.expect(await FileSystem.readFile(Path.join(Path.dirname(snapshotSidecar), 'format.ts'), 'utf8'))
      .toContain('formatDate')
  }))

Tests.test('file dependency sidecars cannot import relative files from the consumer project', async () =>
  await withFixture(async fixture => {
    const dependencyRoot = Path.join(fixture.directory, 'dependency')
    const moduleRoot = Path.join(dependencyRoot, '@widgets')
    const taoPath = Path.join(moduleRoot, 'Widgets.tao')
    const sidecarPath = Path.join(moduleRoot, 'FormattedDate.tsx')
    await FileSystem.mkdir(Path.join(dependencyRoot, '.tao'), { recursive: true })
    await FileSystem.mkdir(moduleRoot, { recursive: true })
    await FileSystem.writeFile(taoPath, 'public view FormattedDate(Value text) from ./FormattedDate.tsx\n')
    const consumerHelper = Path.join(fixture.moduleRoot, 'consumer-helper.ts')
    await FileSystem.writeFile(consumerHelper, 'export const value = true\n')
    const importPath = Path.relative(Path.dirname(sidecarPath), consumerHelper).replaceAll('\\', '/')
    await FileSystem.writeFile(
      sidecarPath,
      `import { value } from './${importPath}'\nexport function FormattedDate(props: { Value: string }) { return null }\nvoid value; void props\n`,
    )
    const dependencyDocument = transform(
      createParser().parse(
        'public view FormattedDate(Value text) from ./FormattedDate.tsx',
      ),
    )!
    fixture.program.modules.push({ path: taoPath, document: dependencyDocument, bindings: [] })
    await Tests.rejects(
      prepareSidecarPipeline({ ...fixture, executor: executeTypeScript }),
      /crosses its module boundary/i,
    )
  }))

Tests.test('foreign view contracts accept matching named exports and reject invalid exports or props', async () =>
  await withFixture(async fixture => {
    const executor = executeTypeScript
    const valid = await prepareSidecarPipeline({ ...fixture, executor })
    Tests.expect(valid.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx'))
      .toContain('foreign-views')

    await FileSystem.writeFile(
      Path.join(fixture.moduleRoot, 'FormattedDate.tsx'),
      'export function OtherView(props: { Value: string }) { return null }\n',
    )
    await Tests.rejects(
      prepareSidecarPipeline({ ...fixture, executor }),
      /does not satisfy its declared props contract/i,
    )

    await FileSystem.writeFile(
      Path.join(fixture.moduleRoot, 'FormattedDate.tsx'),
      'export function FormattedDate(props: { Value: number }) { return null }\n',
    )
    await Tests.rejects(
      prepareSidecarPipeline({ ...fixture, executor }),
      /does not satisfy its declared props contract/i,
    )
  }))

type Fixture = {
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

async function withFixture(action: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await createFixture()
  await Try(action.bind(undefined, fixture), {
    finally: () => FileSystem.rm(fixture.directory, { recursive: true, force: true }),
  })
}

function recordingExecutor(onCall: () => void): ContractExecutor {
  return async () => {
    onCall()
    return { status: 0, stdout: '', stderr: '' }
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
  await FileSystem.mkdir(Path.join(moduleRoot), { recursive: true })
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

async function executeTypeScript(
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

function programFor(path: string, document: NonNullable<ReturnType<typeof transform>>) {
  return {
    entry: path,
    modules: [{ path, document, bindings: [] }],
    definitions: [],
  }
}
