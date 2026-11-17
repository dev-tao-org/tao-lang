import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { createProjectDependencyOptions } from '../workspace-src/dependencies/Options'
import { prepareDependencies } from '../workspace-src/dependencies/Store'
import { compileLibraryPackage } from '../workspace-src/LibraryPackage'
import { initializeProject } from '../workspace-src/projects/Projects'

const DependencyDeclarationDriftRegx = /Dependency declarations changed; setup and preview restart are required/

Tests.test('library compilation rejects changed transitive source declarations before resolving their new target', async () => {
  const directory = Artifacts.resolvePath('tmp', `library-dependency-drift-${Platform.randomUUID()}`)
  const root = Path.join(directory, 'library')
  const widgets = Path.join(directory, 'widgets')
  const output = Path.join(directory, 'output')
  await Try(async () => {
    await createTransitiveLibrary(directory)
    const options = await createProjectDependencyOptions(root)
    await prepareDependencies(root, await options.readRequirements(root), options)
    const lock = Path.join(root, '.tao/store/dependencies.lock.json')
    const preparedLock = await FS.readFile(lock)
    const changedRequirements = S`
      requires file:../new-theme version local as Theme
    `
    await FS.writeFile(Path.join(widgets, 'Dependencies.tao'), changedRequirements)
    Tests.expect(await FS.exists(Path.join(directory, 'new-theme'))).toBe(false)
    await Tests.rejects(
      compileLibraryPackage({ entry: Path.join(root, 'Library.tao'), out: output, name: '@example/drift' }),
      DependencyDeclarationDriftRegx,
    )
    Tests.expect(await FS.readFile(lock)).toEqual(preparedLock)
    Tests.expect(await FS.exists(output)).toBe(false)
    Tests.expect(await FS.exists(Path.join(directory, 'new-theme'))).toBe(false)
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

async function createTransitiveLibrary(directory: string): Promise<void> {
  const root = Path.join(directory, 'library')
  const widgets = Path.join(directory, 'widgets')
  const theme = Path.join(directory, 'old-theme')
  await initializeProject(root)
  await initializeProject(widgets)
  await initializeProject(theme)
  await FS.mkdirs(Path.join(widgets, '@ui'), Path.join(theme, '@ui'))
  await FS.writeFile(
    Path.join(root, 'Library.tao'),
    S`
      requires file:../widgets version local as Widgets
      use Widgets@ui Widget
      ts-library Demo { publish { Own, } }
      package view Own { render Widget }
    `,
  )
  await FS.writeFile(
    Path.join(widgets, 'Dependencies.tao'),
    S`
      requires file:../old-theme version local as Theme
    `,
  )
  await FS.writeFile(
    Path.join(widgets, '@ui/Widget.tao'),
    S`
      use Theme@ui Theme
      package view Widget { render Theme }
    `,
  )
  await FS.writeFile(
    Path.join(theme, '@ui/Theme.tao'),
    S`
      use tao@ui Text
      package view Theme { render Text("Old theme output") }
    `,
  )
}
