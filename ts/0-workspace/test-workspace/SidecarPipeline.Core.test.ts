import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import { Json } from '@shared'
import * as Tests from '@shared-tests'

import { NewlineCharacter, S } from '@shared'
import * as Shared from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { prepareSidecarPipeline } from '../workspace-src/SidecarPipeline'
import { ensureTypeScriptDefaults } from '../workspace-src/sidecars/ManagedModule/ManagedModuleMetadata'
import * as SidecarPipelineTestFixtures from './SidecarPipeline.test-fixtures'

const ForeignViewSidecarImportErrorRegx = /Cannot resolve foreign view sidecar import/
const SidecarSnapshotRestartRequiredRegx = /Restart preview to reclaim sidecar snapshots/
const EscapingModuleBoundaryErrorRegx = /escapes its module boundary/i
const CrossingModuleBoundaryErrorRegx = /crosses its module boundary/i
const ForeignViewPropsContractErrorRegx = /does not satisfy its declared props contract/i

Tests.test('sidecar snapshots include helpers and assets, reuse unchanged checks, and preserve prior revisions', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    let checks = 0
    const executor = SidecarPipelineTestFixtures.recordingExecutor(() => checks++)
    const first = await prepareSidecarPipeline({ ...fixture, executor })
    const originalSnapshot = first.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    Tests.expect(await FS.readFile(originalSnapshot, 'utf8')).toContain("from './format'")
    Tests.expect(await FS.readFile(Path.join(Path.dirname(originalSnapshot), 'format.ts'), 'utf8'))
      .toContain('formatDate')
    Tests.expect(await FS.readFile(Path.join(Path.dirname(originalSnapshot), 'logo.png'), 'utf8'))
      .toBe('asset-bytes')
    Tests.expect(FS.realpathSync(Path.join(Path.dirname(originalSnapshot), 'node_modules')))
      .toBe(FS.realpathSync(fixture.nodeModulesDirectory))
    Tests.expect(checks).toBe(1)

    const cached = await prepareSidecarPipeline({ ...fixture, executor })
    Tests.expect(cached.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')).toBe(originalSnapshot)
    Tests.expect(checks).toBe(1)

    await FS.writeFile(
      Path.join(fixture.moduleRoot, 'format.ts'),
      'export const formatDate = () => "new"' + NewlineCharacter,
    )
    const changed = await prepareSidecarPipeline({ ...fixture, executor })
    const nextSnapshot = changed.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    Tests.expect(nextSnapshot).not.toBe(originalSnapshot)
    Tests.expect(await FS.readFile(originalSnapshot, 'utf8')).toContain("from './format'")
    Tests.expect(await FS.readFile(Path.join(Path.dirname(nextSnapshot), 'format.ts'), 'utf8'))
      .toContain('"new"')
    Tests.expect(checks).toBe(2)
  }))

Tests.test('rebuilds a corrupted snapshot without replacing the previously published tree', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const executor = SidecarPipelineTestFixtures.recordingExecutor(() => {})
    const first = await prepareSidecarPipeline({ ...fixture, executor })
    const original = first.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    await FS.writeFile(
      Path.join(Path.dirname(original), 'format.ts'),
      'export const formatDate = () => "tampered"' + NewlineCharacter,
    )
    await FS.rm(Path.join(Path.dirname(original), 'logo.png'))
    await FS.writeFile(Path.join(Path.dirname(original), 'unexpected.bin'), 'unexpected')

    const repaired = await prepareSidecarPipeline({ ...fixture, executor })
    const replacement = repaired.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    Tests.expect(replacement).not.toBe(original)
    Tests.expect(await FS.readFile(original, 'utf8')).toContain("from './format'")
    Tests.expect(await FS.readFile(replacement, 'utf8')).toContain("from './format'")
    const cached = await prepareSidecarPipeline({ ...fixture, executor })
    Tests.expect(cached.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')).toBe(replacement)
  }))

Tests.test('failed sidecar resolution reports missing import paths for recovery watches', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    await FS.rm(Path.join(fixture.moduleRoot, 'logo.png'))
    const watchedFiles: string[] = []
    await Tests.rejects(
      prepareSidecarPipeline({
        ...fixture,
        executor: SidecarPipelineTestFixtures.recordingExecutor(() => {}),
        async onWatchFiles(files) {
          watchedFiles.push(...files)
        },
      }),
      ForeignViewSidecarImportErrorRegx,
    )
    Tests.expect(watchedFiles).toContain(Path.join(fixture.moduleRoot, 'logo.png'))
  }))

Tests.test('collects foreign views through a symlinked project root', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const alias = Path.join(fixture.directory, 'project-alias')
    await FS.symlink(fixture.projectDirectory, alias, 'dir')
    const aliasEntry = Path.join(alias, '@calendar', 'Calendar.tao')
    const prepared = await prepareSidecarPipeline({
      ...fixture,
      projectDirectory: alias,
      program: SidecarPipelineTestFixtures.createProgramFor(aliasEntry, fixture.program.modules[0]!.document),
      executor: SidecarPipelineTestFixtures.recordingExecutor(() => {}),
    })
    const snapshot = prepared.resolveForeignViewPath(aliasEntry, './FormattedDate.tsx')
    Tests.expect(await FS.readFile(snapshot, 'utf8')).toContain('FormattedDate')
    Tests.expect(prepared.snapshotDirectories.some(path => path.includes('foreign-views'))).toBe(true)
  }))

Tests.test('blocks a new snapshot when the active session reaches its snapshot budget', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const options = { ...fixture, executor: SidecarPipelineTestFixtures.recordingExecutor(() => {}), snapshotLimit: 1 }
    const first = await prepareSidecarPipeline(options)
    const snapshot = first.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    const cached = await prepareSidecarPipeline(options)
    Tests.expect(cached.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')).toBe(snapshot)
    await FS.writeFile(
      Path.join(fixture.moduleRoot, 'format.ts'),
      'export const formatDate = () => "next"' + NewlineCharacter,
    )

    await Tests.rejects(prepareSidecarPipeline(options), SidecarSnapshotRestartRequiredRegx)
    Tests.expect(await FS.readFile(snapshot, 'utf8')).toContain("from './format'")
  }))

Tests.test('foreign sidecars reject symlink escapes before invoking the checker', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const outside = Path.join(fixture.directory, 'outside.tsx')
    await FS.writeFile(outside, 'export function FormattedDate() { return null }' + NewlineCharacter)
    await FS.rm(Path.join(fixture.moduleRoot, 'FormattedDate.tsx'), { force: true })
    await FS.symlink(outside, Path.join(fixture.moduleRoot, 'FormattedDate.tsx'), 'file')
    let checks = 0
    await Tests.rejects(
      prepareSidecarPipeline({
        ...fixture,
        executor: SidecarPipelineTestFixtures.recordingExecutor(() => checks++),
      }),
      EscapingModuleBoundaryErrorRegx,
    )
    Tests.expect(checks).toBe(0)
  }))

Tests.test('foreign sidecar imports cannot cross into another named module', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const otherModule = Path.join(fixture.projectDirectory, '@other')
    await FS.mkdir(otherModule)
    await FS.writeFile(Path.join(otherModule, 'helper.ts'), 'export const helper = true' + NewlineCharacter)
    await FS.writeFile(
      Path.join(fixture.moduleRoot, 'FormattedDate.tsx'),
      S`
        import { helper } from '../@other/helper'
        export function FormattedDate(props: { Value: string }) { return null }
        void helper; void props
      `,
    )
    let checks = 0
    await Tests.rejects(
      prepareSidecarPipeline({
        ...fixture,
        executor: SidecarPipelineTestFixtures.recordingExecutor(() => checks++),
      }),
      CrossingModuleBoundaryErrorRegx,
    )
    Tests.expect(checks).toBe(0)
  }))

Tests.test('file dependencies can validate sidecars inside their own project and relative helpers', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const dependencyRoot = Path.join(fixture.directory, 'dependency')
    const moduleRoot = Path.join(dependencyRoot, '@widgets')
    const taoPath = Path.join(moduleRoot, 'Widgets.tao')
    await FS.mkdirs(Path.join(dependencyRoot, '.tao'), moduleRoot)
    await FS.writeFile(
      taoPath,
      'package view FormattedDate(Value text) from ./FormattedDate.tsx' + NewlineCharacter,
    )
    await FS.writeFile(
      Path.join(moduleRoot, 'FormattedDate.tao'),
      'package view FormattedDate(Value text) from ./FormattedDate.tsx' + NewlineCharacter,
    )
    await FS.writeFile(
      Path.join(moduleRoot, 'FormattedDate.tsx'),
      S`
        import { formatDate } from './format'
        export function FormattedDate(props: { Value: string }) { return formatDate(props.Value) }
      `,
    )
    await FS.writeFile(
      Path.join(moduleRoot, 'format.ts'),
      'export const formatDate = (value: string) => value' + NewlineCharacter,
    )
    const dependencyDocument = AST.transform(
      Grammar.createParser().parse('package view FormattedDate(Value text) from ./FormattedDate.tsx'),
    )!
    fixture.program.modules.push(...SidecarPipelineTestFixtures.createProgramFor(taoPath, dependencyDocument).modules)
    const prepared = await prepareSidecarPipeline({
      ...fixture,
      executor: SidecarPipelineTestFixtures.executeTypeScript,
    })
    const snapshotSidecar = prepared.resolveForeignViewPath(taoPath, './FormattedDate.tsx')
    Tests.expect(await FS.readFile(snapshotSidecar, 'utf8')).toContain("from './format'")
    Tests.expect(await FS.readFile(Path.join(Path.dirname(snapshotSidecar), 'format.ts'), 'utf8'))
      .toContain('formatDate')
  }))

Tests.test('file dependency sidecars cannot import relative files from the consumer project', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const dependencyRoot = Path.join(fixture.directory, 'dependency')
    const moduleRoot = Path.join(dependencyRoot, '@widgets')
    const taoPath = Path.join(moduleRoot, 'Widgets.tao')
    const sidecarPath = Path.join(moduleRoot, 'FormattedDate.tsx')
    await FS.mkdirs(Path.join(dependencyRoot, '.tao'), moduleRoot)
    await FS.writeFile(
      taoPath,
      'package view FormattedDate(Value text) from ./FormattedDate.tsx' + NewlineCharacter,
    )
    const consumerHelper = Path.join(fixture.moduleRoot, 'consumer-helper.ts')
    await FS.writeFile(consumerHelper, 'export const value = true' + NewlineCharacter)
    const importPath = Path.relative(Path.dirname(sidecarPath), consumerHelper).replaceAll('\\', '/')
    await FS.writeFile(
      sidecarPath,
      Shared.joinTextLines(
        S`
          import { value } from './${importPath}'
          export function FormattedDate(props: { Value: string }) { return null }
          void value; void props
        `,
        '',
      ),
    )
    const dependencyDocument = AST.transform(
      Grammar.createParser().parse('package view FormattedDate(Value text) from ./FormattedDate.tsx'),
    )!
    fixture.program.modules.push(...SidecarPipelineTestFixtures.createProgramFor(taoPath, dependencyDocument).modules)
    await Tests.rejects(
      prepareSidecarPipeline({ ...fixture, executor: SidecarPipelineTestFixtures.executeTypeScript }),
      CrossingModuleBoundaryErrorRegx,
    )
  }))

Tests.test('foreign view contracts accept matching named exports and reject invalid exports or props', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const executor = SidecarPipelineTestFixtures.executeTypeScript
    const valid = await prepareSidecarPipeline({ ...fixture, executor })
    Tests.expect(valid.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx'))
      .toContain('foreign-views')

    await FS.writeFile(
      Path.join(fixture.moduleRoot, 'FormattedDate.tsx'),
      'export function OtherView(props: { Value: string }) { return null }' + NewlineCharacter,
    )
    const watchedFiles: string[] = []
    await Tests.rejects(
      prepareSidecarPipeline({
        ...fixture,
        executor,
        async onWatchFiles(files) {
          watchedFiles.push(...files)
        },
      }),
      ForeignViewPropsContractErrorRegx,
    )
    Tests.expect(watchedFiles).toContain(Path.join(fixture.moduleRoot, 'FormattedDate.tsx'))

    await FS.writeFile(
      Path.join(fixture.moduleRoot, 'FormattedDate.tsx'),
      'export function FormattedDate(props: { Value: number }) { return null }' + NewlineCharacter,
    )
    await Tests.rejects(
      prepareSidecarPipeline({ ...fixture, executor }),
      ForeignViewPropsContractErrorRegx,
    )
  }))

Tests.test('managed snapshots type-check authored views through the packaged Tao runtime API', async () =>
  await SidecarPipelineTestFixtures.withFixture(async fixture => {
    const defaultsPath = Path.join(
      fixture.projectDirectory,
      '.tao/cache/sidecars/typescript-defaults.json',
    )
    await FS.rm(defaultsPath, { force: true })
    await ensureTypeScriptDefaults(fixture.projectDirectory)
    await FS.writeFile(
      Path.join(fixture.moduleRoot, 'FormattedDate.tsx'),
      S`
        import Tao from '@tao/runtime-api'
        import type { TextInputProps } from '@tao/runtime-api'
        export function FormattedDate(props: { Value: string }) {
          const inputProps: TextInputProps = { placeholder: props.Value }
          void inputProps
          return Tao.Text({ children: props.Value })
        }
      `,
    )

    const prepared = await prepareSidecarPipeline({
      ...fixture,
      nodeModulesDirectory: Repo.resolvePath('ts/7-runtime/node_modules'),
      executor: SidecarPipelineTestFixtures.executeTypeScript,
    })
    const sidecar = prepared.resolveForeignViewPath(fixture.taoPath, './FormattedDate.tsx')
    const snapshotDirectory = Path.dirname(sidecar)
    const snapshotConfig = Json.Parse(
      await FS.readFile(Path.join(snapshotDirectory, 'tsconfig.json'), 'utf8'),
    ) as SidecarTypeScriptFixture
    const defaults = Json.Parse(await FS.readFile(defaultsPath, 'utf8')) as SidecarTypeScriptFixture
    Tests.expect(await FS.readFile(sidecar, 'utf8')).toContain("from '@tao/runtime-api'")
    Tests.expect(snapshotConfig.compilerOptions.baseUrl).toBe('.')
    Tests.expect(defaults.compilerOptions.paths['@tao/runtime-api'][0]).toContain('/runtime/TaoRuntimeAPI.ts')
    Tests.expect(defaults.compilerOptions.paths['@shared'][0]).toContain('/shared/shared.ts')
  }))

// Authored fixture output is inspected and deliberately damaged by these tests.
type SidecarTypeScriptFixture = { compilerOptions: { baseUrl: string; paths: Record<string, string[]> } }
