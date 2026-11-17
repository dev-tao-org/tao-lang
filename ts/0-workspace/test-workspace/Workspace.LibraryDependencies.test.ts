import { Errors, NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path } from '@shared/os'
import Exec from '@shared/os/exec'
import { createProjectDependencyOptions } from '../workspace-src/dependencies/Options'
import { prepareDependencies } from '../workspace-src/dependencies/Store'
import { compileLibraryPackage } from '../workspace-src/LibraryPackage'
import { initializeProject } from '../workspace-src/projects/Projects'
import { createStandaloneLibraryFixture } from './Workspace.test-utils'

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
    await FS.symlink(authored, Path.join(output, 'source'), 'dir')
    await Tests.rejects(
      compileLibraryPackage({
        entry: Path.join(root, 'src/tao/Library.tao'),
        out: output,
        name: '@tao-dev/ts-lib-example',
      }),
      ExistingLibraryOutputRegx,
    )
    Tests.expect(await FS.readFile(sentinel, 'utf8')).toBe('Keep authored source')
    Tests.expect(await FS.readdir(output)).toEqual(['source'])
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('direct library compilation can retry its output after a bundle failure', async () => {
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
    await Tests.rejects(compileLibraryPackage(request), isLibraryBundleFailure)
    Tests.expect(await FS.exists(output)).toBe(false)
    await FS.writeFile(sidecar, source)
    await compileLibraryPackage(request)
    const manifest = await FS.readFile(Path.join(output, 'package.json'), 'utf8')
    Tests.expect(manifest).toContain('"./Greeting"')
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('an ordinary TS consumer renders a prepared Tao dependency and refreshes consumer source', async () => {
  const root = await createStandaloneLibraryFixture()
  const alias = root + '-alias'
  await Try(async () => {
    await createDependencyWrapper(root)
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
    Tests.expect(manifest).toContain('"./Greeting"')
    Tests.expect(manifest).not.toContain('"./Widget"')
    const bundle = await FS.readFile(Path.join(output, '_Library.js'), 'utf8')
    Tests.expect(bundle).toContain('Prepared dependency output')
    await FS.rm(output, { recursive: true, force: true })
    await verifyConsumer(root)
  }, {
    async finally() {
      await FS.rm(alias, { force: true })
      await FS.rm(root + '-widgets', { recursive: true, force: true })
      await FS.rm(root, { recursive: true, force: true })
    },
  })
}, 90_000)

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

async function verifyConsumer(root: string): Promise<void> {
  const result = await Exec.capture('just', 'test', { cwd: root, addEnv: { TAO_TEST_SOURCE_REFRESH: '1' } })
  Tests.expect(result.stdout).toContain('.tao/cache/sessions/.cli/libraries/Demo')
  Tests.expect(FS.existsSync(Path.join(root, 'src/.tao'))).toBe(false)
}

function isLibraryBundleFailure(error: unknown): boolean {
  if (!Errors.isNativeError(error)) {
    return false
  }
  const bundlerError = error.cause ?? error
  return Errors.isNativeError(bundlerError) && bundlerError.message === 'Bundle failed'
}
