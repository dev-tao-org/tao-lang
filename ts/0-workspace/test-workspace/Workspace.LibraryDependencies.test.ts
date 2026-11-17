import { NewlineCharacter, S, Schema, Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { createProjectDependencyOptions } from '../workspace-src/dependencies/Options'
import { prepareDependencies } from '../workspace-src/dependencies/Store'
import { compileLibraryPackage } from '../workspace-src/LibraryPackage'
import { initializeProject } from '../workspace-src/projects/Projects'
import { createStandaloneLibraryFixture, installRelocatedLibrary } from './Workspace.test-utils'

const DependencySetupRequiredRegx = /Dependency Widgets needs setup/
const ExistingLibraryOutputRegx = /fresh output directory/

Tests.test('direct library compilation preserves an existing output and its source symlink', async () => {
  const root = await createStandaloneLibraryFixture()
  await Try(async () => {
    const output = Path.join(root, 'output')
    const authored = Path.join(root, 'authored')
    await FS.mkdirs(output, authored)
    const sentinel = Path.join(authored, 'Library.ts')
    await FS.writeFile(sentinel, 'Keep authored source')
    await FS.symlink(authored, Path.join(output, 'ts'), 'dir')
    await Tests.rejects(
      compileLibraryPackage({
        entry: Path.join(root, 'src/tao/Library.tao'),
        out: output,
        name: '@tao-dev/ts-lib-example',
      }),
      ExistingLibraryOutputRegx,
    )
    Tests.expect(await FS.readFile(sentinel, 'utf8')).toBe('Keep authored source')
    Tests.expect(await FS.readdir(output)).toEqual(['ts'])
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('direct library compilation can retry its output after a missing sidecar import', async () => {
  const root = await createStandaloneLibraryFixture()
  await Try(async () => {
    const output = Path.join(root, 'output')
    const sidecar = Path.join(root, 'src/ts/ForeignGreeting.tsx')
    const source = await FS.readFile(sidecar, 'utf8')
    const request = {
      entry: Path.join(root, 'src/tao/Library.tao'),
      out: output,
      name: '@tao-dev/ts-lib-example',
    }
    await FS.writeFile(sidecar, "export { ForeignGreeting } from './missing-library-module'" + NewlineCharacter)
    await Tests.expect(compileLibraryPackage(request)).rejects.toThrow('Cannot resolve foreign view sidecar import')
    Tests.expect(await FS.exists(output)).toBe(false)
    await FS.writeFile(sidecar, source)
    await compileLibraryPackage(request)
    const manifest = await FS.readFile(Path.join(output, 'package.json'), 'utf8')
    Tests.expect(manifest).toContain('".": "./ts/Library.ts"')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test(
  'an ordinary TS consumer renders a relocated library and its prepared dependency, then refreshes',
  async () => {
    const root = await createStandaloneLibraryFixture()
    const alias = root + '-alias'
    await Try(async () => {
      await createDependencyWrapper(root)
      await usePublishedPackageInSidecar(root)
      const options = await createProjectDependencyOptions(root)
      await prepareDependencies(root, await options.readRequirements(root), options)
      await FS.symlink(root, alias, 'dir')
      const output = Path.join(root, '.tao/cache/sessions/.cli/libraries/Demo')
      await compileLibraryPackage({
        entry: Path.join(alias, 'src/tao/Library.tao'),
        out: output,
        name: '@tao-dev/ts-lib-example',
      })
      const manifest = await FS.readFile(Path.join(output, 'package.json'), 'utf8')
      Tests.expect(manifest).toContain('".": "./ts/Library.ts"')
      Tests.expect(manifest).not.toContain('"./Widget"')
      const view = await FS.readFile(Path.join(output, 'ts/dependencies/Widgets/@ui/Widget.views.tsx'), 'utf8')
      Tests.expect(view).toContain('Prepared dependency output')
      const library = await installRelocatedLibrary(root, output, '@tao-dev/ts-lib-example')
      await Exec.captureStdout('tsc', ['--project', Path.join(library, 'ts/tsconfig.json')])
      await verifyInstalledConsumer(root)
    }, {
      async finally() {
        await FS.rm(alias, { force: true })
        await FS.rm(root + '-widgets', { recursive: true, force: true })
        await FS.rm(root, { recursive: true, force: true })
      },
    })
  },
  90_000,
)

Tests.test('library compilation requires a prepared external dependency without preparing it implicitly', async () => {
  const root = await createStandaloneLibraryFixture()
  await Try(async () => {
    await createDependencyWrapper(root)
    const lock = Path.join(root, '.tao/store/dependencies.lock.json')
    Tests.expect(await FS.exists(lock)).toBe(false)
    await Tests.rejects(
      compileLibraryPackage({
        entry: Path.join(root, 'src/tao/Library.tao'),
        out: Path.join(root, '.tao/cache/sessions/.cli/libraries/Demo'),
        name: '@tao-dev/ts-lib-example',
      }),
      DependencySetupRequiredRegx,
    )
    Tests.expect(await FS.exists(lock)).toBe(false)
    Tests.expect(await FS.exists(Path.join(root, '.tao/cache/sessions/.cli/libraries/Demo'))).toBe(false)
  }, {
    async finally() {
      await FS.rm(root + '-widgets', { recursive: true, force: true })
      await FS.rm(root, { recursive: true, force: true })
    },
  })
})

async function createDependencyWrapper(root: string): Promise<void> {
  const widgets = root + '-widgets'
  await initializeProject(widgets)
  await FS.mkdir(Path.join(widgets, '@ui'))
  await FS.writeFile(
    Path.join(widgets, '@ui/Widget.tao'),
    S`
      use tao@ui Text
      public view Widget { render Text("Prepared dependency output") }
    `,
  )
  await FS.writeFile(
    Path.join(root, 'Dependencies.tao'),
    `requires file:../${Path.basename(widgets)} version local as Widgets${NewlineCharacter}`,
  )
  const entry = Path.join(root, 'src/tao/Library.tao')
  const source = await FS.readFile(entry, 'utf8')
  const wrapper = source.replace('    Text(First)', '    Text(First)' + NewlineCharacter + '    Widget')
  Tests.expect(wrapper).not.toBe(source)
  const wrapperSource = 'use Widgets@ui Widget' + NewlineCharacter + wrapper
  await FS.writeFile(entry, wrapperSource)
  const journey = Path.join(root, 'src/ts/test/ConsumerJourney.ts')
  const consumer = await FS.readFile(journey, 'utf8')
  const dependencyJourney = consumer.replace(
    '  await verifyLanguageFeatures(page)',
    "  await first.getByText('Prepared dependency output', { exact: true }).waitFor()" + NewlineCharacter
      + '  await verifyLanguageFeatures(page)',
  )
  Tests.expect(dependencyJourney).not.toBe(consumer)
  await FS.writeFile(journey, dependencyJourney)
}

async function usePublishedPackageInSidecar(root: string): Promise<void> {
  const directory = Path.join(root, 'src/tao')
  const path = Path.join(directory, 'PortableGreeting.tsx')
  const declaration = Path.join(directory, 'LanguageFeatures.tao')
  const source = await FS.readFile(declaration, 'utf8')
  await FS.writeFile(declaration, source.replace('../ts/ForeignGreeting.tsx', './PortableGreeting.tsx'))
  await FS.writeFile(
    Path.join(directory, 'GreetingProps.d.ts'),
    'export type GreetingProps = { Value: string }',
  )
  const external = Path.join(root, 'src/ts/node_modules/@cards/external')
  await FS.mkdir(external)
  await FS.writeJson(Path.join(external, 'package.json'), { name: '@cards/external', types: './Types.d.ts' })
  await FS.writeFile(Path.join(external, 'Types.d.ts'), 'export type Fields = { Optional?: string }')
  await FS.writeFile(Path.join(directory, 'prefix.mjs'), "export { default } from './prefix-value.mjs'")
  await FS.writeFile(Path.join(directory, 'prefix.d.mts'), 'declare const Prefix: string; export default Prefix')
  await FS.writeFile(Path.join(directory, 'prefix-value.mjs'), "export default 'Foreign view: '")
  await FS.writeFile(Path.join(directory, 'logo.png'), new Uint8Array([137, 80, 78, 71]))
  await FS.writeFile(
    path,
    S`
      import { Caption } from '@cards'
      import Prefix from './prefix.mjs'
      type Props = import('./GreetingProps').GreetingProps & import('@cards/external').Fields & {
        Logo?: typeof import('./logo.png').default
      }
      const CaptionAlias = Caption

      export function ForeignGreeting({ Value }: Props) {
        return <CaptionAlias Value={Prefix + Value} />
      }
    `,
  )
}

const ConsumerManifest = Schema.object({
  tao: Schema.object({ compile: Schema.unknown().optional(), run: Schema.unknown() }).passthrough(),
}).passthrough()

async function verifyInstalledConsumer(root: string): Promise<void> {
  const cwd = Path.join(root, 'src/ts')
  const manifestPath = Path.join(cwd, 'package.json')
  const manifest = await FS.readJson(manifestPath, { schema: ConsumerManifest })
  delete manifest.tao.compile
  await FS.writeJson(manifestPath, manifest)
  await Exec.captureStdout('tsc', [
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    '--jsx',
    'react-jsx',
    '--module',
    'ESNext',
    '--moduleResolution',
    'Bundler',
    '--target',
    'ES2022',
    '--allowSyntheticDefaultImports',
    '--types',
    'react',
    '--preserveSymlinks',
    'Consumer.tsx',
    'test/TypeChecks.tsx',
  ], { cwd })
  const addEnv = { TAO_TEST_SOURCE_REFRESH: '1', TAO_CLI: Repo.resolvePath('tao') }
  const result = await Exec.capture('bun', ['test', 'test'], { cwd, addEnv })
  Tests.expect(result.stderr).toContain('Tao library renders React props, children and mount-local state')
  Tests.expect(FS.existsSync(Path.join(root, 'src/.tao'))).toBe(false)
}
