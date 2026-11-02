import { NewlineCharacter, S, Try } from '@shared'
import { FileSystem, Path, Platform, Tests } from '@shared/os'
import { createProjectDependencyOptions } from '../workspace-src/dependencies/Options'
import { prepareDependencies } from '../workspace-src/dependencies/Store'
import { compileLibraryPackage } from '../workspace-src/LibraryPackage'
import { initializeProject } from '../workspace-src/projects/Projects'
import { createStandaloneLibraryFixture } from './StandaloneLibrary'

const DependencySetupRequiredRegx = /Dependency widgets needs setup/

Tests.test('an ordinary TS consumer renders an own published wrapper using a prepared Tao dependency', async () => {
  const root = await createStandaloneLibraryFixture()
  const alias = root + '-alias'
  await Try(async () => {
    await createDependencyWrapper(root)
    const options = await createProjectDependencyOptions(root)
    await prepareDependencies(root, await options.readRequirements(root), options)
    await FileSystem.symlink(root, alias, 'dir')
    const output = Path.join(root, '.tao/cache/libraries/Demo')
    await compileLibraryPackage({
      entry: Path.join(alias, 'src/tao/Library.tao'),
      out: output,
      name: '@example/tao-library',
    })
    const manifest = await FileSystem.readFile(Path.join(output, 'package.json'), 'utf8')
    Tests.expect(manifest).toContain('"./Greeting"')
    Tests.expect(manifest).not.toContain('"./Widget"')
    const bundle = await FileSystem.readFile(Path.join(output, '_Library.js'), 'utf8')
    Tests.expect(bundle).toContain('Prepared dependency output')
    await FileSystem.rm(output, { recursive: true, force: true })
    await verifyConsumer(root)
  }, {
    async finally() {
      await FileSystem.rm(alias, { force: true })
      await FileSystem.rm(root + '-widgets', { recursive: true, force: true })
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
}, 90_000)

Tests.test('library compilation requires a prepared external dependency without preparing it implicitly', async () => {
  const root = await createStandaloneLibraryFixture()
  await Try(async () => {
    await createDependencyWrapper(root)
    const lock = Path.join(root, '.tao/store/dependencies.lock.json')
    Tests.expect(await FileSystem.exists(lock)).toBe(false)
    await Tests.rejects(
      compileLibraryPackage({
        entry: Path.join(root, 'src/tao/Library.tao'),
        out: Path.join(root, '.tao/cache/libraries/Demo'),
        name: '@example/tao-library',
      }),
      DependencySetupRequiredRegx,
    )
    Tests.expect(await FileSystem.exists(lock)).toBe(false)
    Tests.expect(await FileSystem.exists(Path.join(root, '.tao/cache/libraries/Demo'))).toBe(false)
  }, {
    async finally() {
      await FileSystem.rm(root + '-widgets', { recursive: true, force: true })
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})

async function createDependencyWrapper(root: string): Promise<void> {
  const widgets = root + '-widgets'
  await initializeProject(widgets)
  await FileSystem.mkdir(Path.join(widgets, '@ui'))
  await FileSystem.writeFile(
    Path.join(widgets, '@ui/Widget.tao'),
    S`
      use tao@ui Text
      public view Widget { render Text("Prepared dependency output") }
    `,
  )
  await FileSystem.writeFile(
    Path.join(root, 'Dependencies.tao'),
    `requires file:../${Path.basename(widgets)} version local as widgets${NewlineCharacter}`,
  )
  const entry = Path.join(root, 'src/tao/Library.tao')
  const source = await FileSystem.readFile(entry, 'utf8')
  const wrapper = source.replace('    Text(First)', '    Text(First)' + NewlineCharacter + '    Widget')
  Tests.expect(wrapper).not.toBe(source)
  const wrapperSource = 'use widgets@ui Widget' + NewlineCharacter + wrapper
  await FileSystem.writeFile(entry, wrapperSource)
  const journey = Path.join(root, 'src/ts/test/ConsumerJourney.ts')
  const consumer = await FileSystem.readFile(journey, 'utf8')
  const dependencyJourney = consumer.replace(
    '  await verifyLanguageFeatures(page)',
    "  await first.getByText('Prepared dependency output', { exact: true }).waitFor()" + NewlineCharacter
      + '  await verifyLanguageFeatures(page)',
  )
  Tests.expect(dependencyJourney).not.toBe(consumer)
  await FileSystem.writeFile(journey, dependencyJourney)
}

async function verifyConsumer(root: string): Promise<void> {
  const child = Platform.spawnPiped('just test', { cwd: root })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  Tests.expect({ status, stdout, stderr }).toMatchObject({ status: 0 })
}
